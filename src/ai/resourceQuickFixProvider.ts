import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { t } from '../i18n';

const RESOURCE_DIAGNOSTIC_SOURCE = 'rwMod-resources';

const MAX_CANDIDATES = 5;

const IMAGE_EXTS = new Set(['png']);
const AUDIO_EXTS = new Set(['ogg', 'wav']);

export class ResourceQuickFixProvider implements vscode.CodeActionProvider {

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (document.languageId !== 'rusted-warfare' && document.languageId !== 'ini') {
      return [];
    }

    // 找出当前行上的资源路径 diagnostic
    const resourceDiag = context.diagnostics.find(
      d => d.source === RESOURCE_DIAGNOSTIC_SOURCE
    );
    if (!resourceDiag) {
      return [];
    }

    const missingPath = extractMissingPath(resourceDiag);
    if (!missingPath) {
      return [];
    }

    const lineText = document.lineAt(resourceDiag.range.start.line).text;
    const fieldName = inferFieldName(lineText);
    const wantedType = getWantedResourceType(fieldName);
    const candidates = this.findCandidates(document, missingPath, wantedType);

    if (candidates.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
      actions.push(this.makeReplaceAction(document, resourceDiag, candidate));
    }

    return actions;
  }

  private findCandidates(
    document: vscode.TextDocument,
    missingPath: string,
    wantedType: 'image' | 'audio' | 'any',
  ): CandidateFile[] {
    const docDir = path.dirname(document.uri.fsPath);
    const missingBase = path.basename(missingPath).toLowerCase().replace(/^['"]|['"]$/g, '');
    const missingStem = path.parse(missingBase).name;

    const scoredCandidates: CandidateFile[] = [];
    const fallbackCandidates: CandidateFile[] = [];
    const seen = new Set<string>();

    // 1. 扫同目录：分别收集相似候选和兜底候选
    this.scanDirectory(docDir, wantedType, (filePath, basename) => {
      const key = filePath.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const relativePath = toForwardSlash(path.relative(docDir, filePath));
      const score = computeSimilarity(basename, missingBase, missingStem);

      if (score >= 0) {
        scoredCandidates.push({ filePath, basename, relativePath, score });
      } else {
        fallbackCandidates.push({ filePath, basename, relativePath, score: 0.1 });
      }
    });

    // 2. 如果同目录没找到足够候选，扫工作区补（只补相似匹配）
    if (scoredCandidates.length < MAX_CANDIDATES) {
      for (const folder of vscode.workspace.workspaceFolders || []) {
        this.scanDirectory(folder.uri.fsPath, wantedType, (filePath, basename) => {
          const key = filePath.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);

          const score = computeSimilarity(basename, missingBase, missingStem);
          if (score < 0) return;

          const relativePath = toForwardSlash(path.relative(folder.uri.fsPath, filePath));
          scoredCandidates.push({ filePath, basename, relativePath: `ROOT:${relativePath}`, score });
        });
      }
    }

    // 3. 合并：高分优先，兜底补齐
    scoredCandidates.sort((a, b) => b.score - a.score);
    const result = scoredCandidates.slice(0, MAX_CANDIDATES);

    if (result.length < MAX_CANDIDATES) {
      for (const fb of fallbackCandidates) {
        if (result.length >= MAX_CANDIDATES) break;
        if (result.some(c => c.filePath === fb.filePath)) continue;
        result.push(fb);
      }
    }

    return result;
  }

  private scanDirectory(
    dirPath: string,
    wantedType: 'image' | 'audio' | 'any',
    onFile: (filePath: string, basename: string) => void,
  ): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 递归扫子目录（铁锈战争 MOD 常用子目录归类资源）
          this.scanDirectory(fullPath, wantedType, onFile);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase().replace(/^\./, '');
        if (wantedType === 'image' && !IMAGE_EXTS.has(ext)) continue;
        if (wantedType === 'audio' && !AUDIO_EXTS.has(ext)) continue;

        onFile(fullPath, entry.name);
      }
    } catch {
      // 目录不可读则跳过
    }
  }

  private makeReplaceAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    candidate: CandidateFile,
  ): vscode.CodeAction {
    // 只替换文件路径部分（diagnostic range），不碰整行
    const replaceEdit = new vscode.WorkspaceEdit();
    replaceEdit.replace(document.uri, diagnostic.range, candidate.relativePath);

    const action = new vscode.CodeAction(
      t('replaceWith', candidate.basename),
      vscode.CodeActionKind.QuickFix,
    );
    action.edit = replaceEdit;
    action.diagnostics = [diagnostic];
    action.isPreferred = candidate.score >= 0.8;

    return action;
  }
}

// ── 类型 ──

interface CandidateFile {
  filePath: string;
  basename: string;
  relativePath: string;
  score: number;
}

// ── 工具函数 ──

function extractMissingPath(diagnostic: vscode.Diagnostic): string | null {
  if (diagnostic.source !== RESOURCE_DIAGNOSTIC_SOURCE) return null;
  const msg = diagnostic.message;
  // 匹配中英文两种格式: "资源文件不存在: xxx" / "Resource file not found: xxx"
  const match = msg.match(/:\s*(.+)$/);
  return match ? match[1].trim() : null;
}

function inferFieldName(lineText: string): string {
  const colonIdx = lineText.indexOf(':');
  if (colonIdx < 0) return '';
  return lineText.slice(0, colonIdx).trim().toLowerCase();
}

function getWantedResourceType(fieldName: string): 'image' | 'audio' | 'any' {
  if (fieldName.includes('sound') || fieldName.includes('audio')) return 'audio';
  if (fieldName.includes('image') || fieldName.includes('icon')) return 'image';
  return 'any';
}

/**
 * 计算候选文件名与缺失文件名的相似度（0~1）
 * 完全匹配 = 1，同词干 = 高，完全不相关 < 0
 */
function computeSimilarity(
  candidateBase: string,
  missingBase: string,
  missingStem: string,
): number {
  const cBase = candidateBase.toLowerCase();
  const mBase = missingBase.toLowerCase();

  // 完全匹配 → 最高分（理论上不会出现，但保底）
  if (cBase === mBase) return 1.0;

  const cStem = path.parse(cBase).name;

  // 同名但不同后缀（如 tank.png → tank.jpg）
  if (cStem === missingStem) return 0.9;

  // 候选包含缺失名 或 缺失名包含候选（如 tank → tank_base / tank_base → tank）
  if (cStem.includes(missingStem) || missingStem.includes(cStem)) {
    const shorter = Math.min(cStem.length, missingStem.length);
    const overlap = missingStem.includes(cStem) ? cStem.length : missingStem.length;
    return 0.5 + (overlap / shorter) * 0.4;
  }

  // 通用词干匹配
  const cWords = cStem.split(/[_\s.-]+/).filter(Boolean);
  const mWords = missingStem.split(/[_\s.-]+/).filter(Boolean);
  let matches = 0;
  for (const cw of cWords) {
    if (mWords.includes(cw)) matches++;
  }
  if (matches > 0) {
    return 0.3 + (matches / Math.max(cWords.length, mWords.length)) * 0.3;
  }

  return -1; // 不相关
}

function toForwardSlash(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}


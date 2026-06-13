import * as vscode from 'vscode';
import * as path from 'path';

const DIAGNOSTIC_SOURCE = 'rwMod-reference-freshness';

export class ReferenceFreshnessDiagnosticProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  dispose(): void {
    this.collection.dispose();
  }

  async refresh(document: vscode.TextDocument): Promise<void> {
    if (!isIniDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }

    const dirtyPaths = new Set(
      vscode.workspace.textDocuments
        .filter(doc => doc.isDirty && doc.uri.scheme === 'file')
        .map(doc => normalizePath(doc.uri.fsPath)),
    );
    const dirtyBasenames = new Map(
      vscode.workspace.textDocuments
        .filter(doc => doc.isDirty && doc.uri.scheme === 'file')
        .map(doc => [path.basename(doc.uri.fsPath).toLowerCase(), doc.uri.fsPath]),
    );

    const diagnostics: vscode.Diagnostic[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
      const line = document.lineAt(lineNumber).text;
      const match = line.match(/^(\s*)copyFrom\s*[:=]\s*(.+)$/i);
      if (!match) continue;

      const valueStart = line.indexOf(match[2]);
      // 处理带扩展名的值（存在性 + dirty 检查）
      for (const token of splitCopyFrom(match[2], valueStart)) {
        const filePath = await resolveTargetFile(document, token.text, dirtyBasenames);
        if (!filePath) {
          // 文件不存在
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(lineNumber, token.start, lineNumber, token.end),
            `引用的文件不存在: ${token.text}`,
            vscode.DiagnosticSeverity.Error,
          );
          diagnostic.source = DIAGNOSTIC_SOURCE;
          diagnostics.push(diagnostic);
        } else if (dirtyPaths.has(normalizePath(filePath))) {
          // 文件存在但未保存
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(lineNumber, token.start, lineNumber, token.end),
            `引用目标文件有未保存修改: ${path.basename(filePath)}`,
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.source = DIAGNOSTIC_SOURCE;
          diagnostics.push(diagnostic);
        }
        // 文件存在且已保存 → 不报
      }

      // 处理不带扩展名的值（在 [core] 中时提示加后缀）
      if (isInCoreSection(document, lineNumber)) {
        for (const token of splitCopyFromNoExt(match[2], valueStart)) {
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(lineNumber, token.start, lineNumber, token.end),
            `copyFrom 值建议加上 .ini 或 .template 扩展名: ${token.text}`,
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.source = DIAGNOSTIC_SOURCE;
          diagnostics.push(diagnostic);
        }
      }
    }

    this.collection.set(document.uri, diagnostics);
  }
}

function splitCopyFrom(value: string, offset: number): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  const partRe = /[^,]+/g;
  let match: RegExpExecArray | null;
  while ((match = partRe.exec(value)) !== null) {
    const raw = match[0];
    const leading = raw.match(/^\s*/)?.[0].length || 0;
    const text = raw.slice(leading).trim().replace(/^['"]|['"]$/g, '');
    if (!text || !/\.(ini|template)$/i.test(text)) continue;
    const start = offset + match.index + leading;
    result.push({ text, start, end: start + text.length });
  }
  return result;
}

/** 提取不带 .ini/.template 扩展名的 copyFrom 值 */
function splitCopyFromNoExt(value: string, offset: number): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  const partRe = /[^,]+/g;
  let match: RegExpExecArray | null;
  while ((match = partRe.exec(value)) !== null) {
    const raw = match[0];
    const leading = raw.match(/^\s*/)?.[0].length || 0;
    const text = raw.slice(leading).trim().replace(/^['"]|['"]$/g, '');
    if (!text || /\.(ini|template)$/i.test(text)) continue;
    const start = offset + match.index + leading;
    result.push({ text, start, end: start + text.length });
  }
  return result;
}

/** 判断某行是否在 [core] 段内 */
function isInCoreSection(document: vscode.TextDocument, lineNumber: number): boolean {
  for (let i = lineNumber - 1; i >= 0; i--) {
    const match = document.lineAt(i).text.trim().match(/^\[([^\]]+)\]\s*$/);
    if (match) {
      return match[1].trim().toLowerCase() === 'core';
    }
  }
  return false;
}

async function resolveTargetFile(
  document: vscode.TextDocument,
  rawValue: string,
  dirtyBasenames: Map<string, string>,
): Promise<string | null> {
  const clean = rawValue.replace(/^ROOT:/i, '').replace(/^CUSTOM:/i, '').trim();

  // 候选路径：当前文件同目录 + 各工作区根目录
  const candidates = [
    path.join(path.dirname(document.uri.fsPath), clean),
    ...((vscode.workspace.workspaceFolders || []).map(folder => path.join(folder.uri.fsPath, clean))),
  ];

  // 检查每个候选路径是否真实存在于磁盘
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      return candidate;
    } catch {
      continue;
    }
  }

  // 兜底：按文件名匹配已打开的脏文件（路径可能对不上但编辑器里有）
  const base = path.basename(clean).toLowerCase();
  if (dirtyBasenames.has(base)) {
    return dirtyBasenames.get(base)!;
  }

  return null;
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

function isIniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'rusted-warfare' || document.languageId === 'ini';
}

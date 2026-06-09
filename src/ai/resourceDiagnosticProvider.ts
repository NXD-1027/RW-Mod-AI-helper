import * as vscode from 'vscode';
import * as path from 'path';
import { t } from '../i18n';

const RESOURCE_DIAGNOSTIC_SOURCE = 'rwMod-resources';

const FILE_FIELD_NAMES = new Set([
  'image',
  'image_back',
  'image_shield',
  'image_wreak',
  'image_turret',
  'image_shadow',
  'icon_zoomed_out',
  'icon_build',
  'iconimage',
  'iconextraimage',
  'playSoundAtUnit',
  'playSoundGlobally',
  'playSoundToPlayer',
  'soundOnAttackOrder',
  'soundOnMoveOrder',
  'soundOnNewSelection',
  'shoot_sound',
  'explodeEffect',
]);

const SPECIAL_VALUES = new Set([
  'NONE',
  'AUTO',
  'SHADOW',
]);

const BUILTIN_SOUNDS = new Set([
  'bug_attack',
  'bug_die',
  'building_explode',
  'cannon_firing',
  'click',
  'click_add',
  'click_remove',
  'firing3',
  'firing4',
  'gun_fire',
  'interface_error',
  'large_gun_fire1',
  'large_gun_fire2',
  'laser_deflect',
  'laser_deflect2',
  'lighting_burst',
  'message',
  'missile_fire',
  'missile_hit',
  'move',
  'nuke_explode',
  'nuke_launch',
  'plasma_fire',
  'plasma_fire2',
  'tank_firing',
  'unit_explode',
  'unit_explode_old',
  'warning',
]);

interface ResourceToken {
  text: string;
  start: number;
  end: number;
}

export class ResourceDiagnosticProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private generation = 0;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(RESOURCE_DIAGNOSTIC_SOURCE);
  }

  dispose(): void {
    this.collection.dispose();
  }

  async refresh(document: vscode.TextDocument): Promise<void> {
    const gen = ++this.generation;

    if (!isIniDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
      const line = document.lineAt(lineNumber).text;
      const parsed = parseResourceLine(line);
      if (!parsed) {
        continue;
      }

      for (const token of extractResourceTokens(parsed.value, parsed.valueStart)) {
        if (shouldSkipToken(parsed.key, token.text)) {
          continue;
        }

        const exists = await resourceExists(document, token.text);
        if (gen !== this.generation) return; // 有更新的 refresh，放弃本次结果
        if (exists) {
          continue;
        }

        const range = new vscode.Range(
          new vscode.Position(lineNumber, token.start),
          new vscode.Position(lineNumber, token.end)
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          t('resourceNotFound', token.text),
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = RESOURCE_DIAGNOSTIC_SOURCE;
        diagnostics.push(diagnostic);
      }
    }

    if (gen !== this.generation) return;
    this.collection.set(document.uri, diagnostics);
  }
}

function isIniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'rusted-warfare' || document.languageId === 'ini';
}

function parseResourceLine(line: string): { key: string; value: string; valueStart: number } | null {
  const match = line.match(/^(\s*)([^:=#;]+?)\s*[:=]\s*(.*)$/);
  if (!match) {
    return null;
  }

  const key = match[2].trim();
  if (!isResourceField(key)) {
    return null;
  }

  const separatorIndex = findSeparatorIndex(line);
  if (separatorIndex < 0) {
    return null;
  }

  let valueStart = separatorIndex + 1;
  while (valueStart < line.length && /\s/.test(line[valueStart])) {
    valueStart++;
  }

  return {
    key,
    value: stripInlineComment(line.slice(valueStart)),
    valueStart,
  };
}

function isResourceField(key: string): boolean {
  const normalized = normalizeKey(key);
  if (FILE_FIELD_NAMES.has(key) || FILE_FIELD_NAMES.has(normalized)) {
    return true;
  }

  return normalized.includes('image')
    || normalized.includes('sound')
    || normalized.includes('icon');
}

function normalizeKey(key: string): string {
  return key.trim().replace(/[_\s]/g, '').toLowerCase();
}

function findSeparatorIndex(line: string): number {
  const colon = line.indexOf(':');
  const equals = line.indexOf('=');
  if (colon < 0) {
    return equals;
  }
  if (equals < 0) {
    return colon;
  }
  return Math.min(colon, equals);
}

function stripInlineComment(value: string): string {
  const commentIndex = value.search(/\s[;#]/);
  return commentIndex >= 0 ? value.slice(0, commentIndex) : value;
}

function extractResourceTokens(value: string, offset: number): ResourceToken[] {
  const tokens: ResourceToken[] = [];
  const tokenRe = /(?:ROOT:)?[^\s,;#'"]+/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(value)) !== null) {
    const text = cleanValue(match[0]);
    if (!text) {
      continue;
    }

    tokens.push({
      text,
      start: offset + match.index,
      end: offset + match.index + match[0].length,
    });
  }

  return tokens;
}

function cleanValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function shouldSkipToken(key: string, token: string): boolean {
  const upper = token.toUpperCase();
  if (SPECIAL_VALUES.has(upper)) {
    return true;
  }

  if (/^(CUSTOM|SHARED|IGNORE):/i.test(token)) {
    return true;
  }

  const normalizedKey = normalizeKey(key);
  if (normalizedKey.includes('sound') && BUILTIN_SOUNDS.has(token)) {
    return true;
  }

  if (normalizedKey.includes('effect') && !looksLikeFilePath(token)) {
    return true;
  }

  return false;
}

function looksLikeFilePath(token: string): boolean {
  return token.includes('/')
    || token.includes('\\')
    || token.startsWith('ROOT:')
    || /\.[A-Za-z0-9]{2,5}$/.test(token);
}

async function resourceExists(document: vscode.TextDocument, rawValue: string): Promise<boolean> {
  const clean = normalizeResourceValue(rawValue);
  if (!clean) {
    return true;
  }

  const candidates = getCandidateUris(document, clean);
  for (const uri of candidates) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.File) {
        return true;
      }
    } catch {
      // 尝试下一个路径
    }
  }

  return false;
}

function normalizeResourceValue(value: string): string {
  return value
    .replace(/^ROOT:/i, '')
    .replace(/^CUSTOM:/i, '')
    .replace(/^SHARED:/i, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function getCandidateUris(document: vscode.TextDocument, resourcePath: string): vscode.Uri[] {
  const candidates: vscode.Uri[] = [];
  const docDir = path.dirname(document.uri.fsPath);

  candidates.push(vscode.Uri.file(path.join(docDir, resourcePath)));

  for (const folder of vscode.workspace.workspaceFolders || []) {
    candidates.push(vscode.Uri.file(path.join(folder.uri.fsPath, resourcePath)));
  }

  return candidates;
}

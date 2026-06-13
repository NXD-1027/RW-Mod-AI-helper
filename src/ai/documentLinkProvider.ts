import * as vscode from 'vscode';
import * as path from 'path';

interface UnitReference {
  uri: vscode.Uri;
}

interface UnitIndex {
  units: Map<string, UnitReference>;
  time: number;
}

const CACHE_TTL = 5000;
const MAX_SCAN_FILES = 500;
let unitIndexCache: UnitIndex | null = null;

const BASE_EXTENSIONS = ['ini', 'template'];

const UNIT_REFERENCE_FIELDS = new Set([
  'spawnunit',
  'spawnunits',
  'produceunits',
  'converto',
  'unitspawnedondeath',
  'upgradedfrom',
  'guibuildunit',
  'unitshowninui',
  'textaddunitname',
  'addunitsintotransport',
  'oncreatespawnunitof',
  'addwaypointunittype',
]);

export class RwDocumentLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentLink[]> {
    if (document.languageId !== 'rusted-warfare' && document.languageId !== 'ini') {
      return [];
    }

    const links: vscode.DocumentLink[] = [];

    // ── [core] copyFrom: 按文件路径跳转（只处理带 .ini/.template 后缀的值） ──
    let currentSection = '';
    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
      const line = document.lineAt(lineNumber).text;

      // 追踪当前段落
      const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim().toLowerCase();
        continue;
      }

      if (currentSection !== 'core') continue;

      const copyMatch = line.match(/^(\s*)copyFrom\s*[:=]\s*(.+)$/i);
      if (!copyMatch) continue;

      const value = stripInlineComment(copyMatch[2]);
      const valueStart = line.indexOf(copyMatch[2]);

      for (const token of splitCopyFromLink(value, valueStart)) {
        const targetUri = await resolveFileUri(document.uri, token.text);
        if (!targetUri) continue;

        const range = new vscode.Range(lineNumber, token.start, lineNumber, token.end);
        const link = new vscode.DocumentLink(range, targetUri);
        link.tooltip = `跳转到文件: ${token.text}`;
        links.push(link);
      }
    }

    // ── 其他单位名引用：按名称匹配跳转 ──
    const unitIndex = await scanWorkspaceUnits();
    if (unitIndex.size > 0) {
      for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
        const line = document.lineAt(lineNumber).text;
        const parsed = parseReferenceLine(line);
        if (!parsed) continue;

        for (const token of findUnitTokens(parsed.value, parsed.valueStart)) {
          const reference = unitIndex.get(token.text);
          if (!reference) continue;

          const range = new vscode.Range(
            new vscode.Position(lineNumber, token.start),
            new vscode.Position(lineNumber, token.end)
          );
          const link = new vscode.DocumentLink(range, reference.uri);
          link.tooltip = `跳转到单位: ${token.text}`;
          links.push(link);
        }
      }
    }

    return links;
  }
}

/** 提取 copyFrom 中带 .ini/.template 后缀的片段，用于文件跳转 */
function splitCopyFromLink(value: string, offset: number): Array<{ text: string; start: number; end: number }> {
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

/** 解析 copyFrom 文件路径，返回磁盘上真实存在的文件 URI */
async function resolveFileUri(
  documentUri: vscode.Uri,
  rawValue: string,
): Promise<vscode.Uri | null> {
  const clean = rawValue.replace(/^ROOT:/i, '').replace(/^CUSTOM:/i, '').trim();
  const dir = path.dirname(documentUri.fsPath);
  const candidates = [
    vscode.Uri.file(path.join(dir, clean)),
    ...((vscode.workspace.workspaceFolders || []).map(folder =>
      vscode.Uri.file(path.join(folder.uri.fsPath, clean))
    )),
  ];
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function scanWorkspaceUnits(): Promise<Map<string, UnitReference>> {
  if (unitIndexCache && Date.now() - unitIndexCache.time < CACHE_TTL) {
    return unitIndexCache.units;
  }

  const units = new Map<string, UnitReference>();
  const uris = await findUnitFiles();

  for (const uri of uris.slice(0, MAX_SCAN_FILES)) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const names = extractUnitNames(content, uri);

      for (const name of names) {
        const normalized = name.trim();
        if (normalized && !units.has(normalized)) {
          units.set(normalized, { uri });
        }
      }
    } catch {
      // 跳过不可读文件
    }
  }

  unitIndexCache = { units, time: Date.now() };
  return units;
}

async function findUnitFiles(): Promise<vscode.Uri[]> {
  const exts = getKnownUnitExtensions();
  const seen = new Set<string>();
  const result: vscode.Uri[] = [];

  for (const ext of exts) {
    const files = await vscode.workspace.findFiles(
      `**/*.${ext}`,
      '**/{node_modules,out,.git}/**',
      MAX_SCAN_FILES
    );

    for (const uri of files) {
      const key = uri.toString();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(uri);
      }
      if (result.length >= MAX_SCAN_FILES) {
        return result;
      }
    }
  }

  return result;
}

function getKnownUnitExtensions(): string[] {
  const exts = new Set(BASE_EXTENSIONS);
  const assoc = vscode.workspace.getConfiguration().get<Record<string, string>>('files.associations') || {};

  for (const [pattern, languageId] of Object.entries(assoc)) {
    if (languageId !== 'rusted-warfare') {
      continue;
    }

    const match = pattern.match(/^\*\.([a-zA-Z0-9_.-]+)$/);
    if (match) {
      exts.add(match[1].replace(/^\./, ''));
    }
  }

  return [...exts];
}

function extractUnitNames(content: string, uri: vscode.Uri): string[] {
  const names: string[] = [];
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    names.push(cleanValue(nameMatch[1]));
  }

  const fileName = uri.path.split('/').pop() || '';
  const stem = fileName.replace(/\.[^.]+$/, '');
  if (stem) {
    names.push(stem);
  }

  return names.filter(Boolean);
}

function parseReferenceLine(line: string): { value: string; valueStart: number } | null {
  const match = line.match(/^(\s*)([^:=#;]+?)\s*[:=]\s*(.*)$/);
  if (!match) {
    return null;
  }

  const key = match[2].trim();
  if (!isReferenceField(key)) {
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

  const value = stripInlineComment(line.slice(valueStart));
  return { value, valueStart };
}

function isReferenceField(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_\s]/g, '');
  if (UNIT_REFERENCE_FIELDS.has(normalized)) {
    return true;
  }

  return /^builtfrom.+name$/.test(normalized);
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

function findUnitTokens(value: string, offset: number): Array<{ text: string; start: number; end: number }> {
  const tokens: Array<{ text: string; start: number; end: number }> = [];
  const tokenRe = /[A-Za-z_0-9][A-Za-z0-9_.-]*/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(value)) !== null) {
    const text = cleanValue(match[0]);
    if (!text || isIgnoredToken(text)) {
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

function stripInlineComment(value: string): string {
  const commentIndex = value.search(/\s[;#]/);
  return commentIndex >= 0 ? value.slice(0, commentIndex) : value;
}

function cleanValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function isIgnoredToken(text: string): boolean {
  const lower = text.toLowerCase();
  return lower === 'true'
    || lower === 'false'
    || lower === 'none'
    || lower === 'null';
}

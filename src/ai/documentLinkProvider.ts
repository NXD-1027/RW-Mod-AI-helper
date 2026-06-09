import * as vscode from 'vscode';

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
  'copyfrom',
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

    const unitIndex = await scanWorkspaceUnits();
    if (unitIndex.size === 0) {
      return [];
    }

    const links: vscode.DocumentLink[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
      const line = document.lineAt(lineNumber).text;
      const parsed = parseReferenceLine(line);
      if (!parsed) {
        continue;
      }

      for (const token of findUnitTokens(parsed.value, parsed.valueStart)) {
        const reference = unitIndex.get(token.text);
        if (!reference) {
          continue;
        }

        const range = new vscode.Range(
          new vscode.Position(lineNumber, token.start),
          new vscode.Position(lineNumber, token.end)
        );
        const link = new vscode.DocumentLink(range, reference.uri);
        link.tooltip = `跳转到单位: ${token.text}`;
        links.push(link);
      }
    }

    return links;
  }
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

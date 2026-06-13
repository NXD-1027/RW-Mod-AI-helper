import * as vscode from 'vscode';
import { t } from '../i18n';

const UNIT_REFERENCE_DIAGNOSTIC_SOURCE = 'rwMod-unit-references';
const CACHE_TTL = 5000;
const MAX_SCAN_FILES = 500;
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
  'overrideandreplace',
]);

const IGNORED_REFERENCE_VALUES = new Set([
  'true',
  'false',
  'none',
  'null',
  'auto',
]);

interface UnitReferenceIndex {
  units: Set<string>;
  time: number;
}

interface UnitReferenceToken {
  text: string;
  start: number;
  end: number;
}

let unitIndexCache: UnitReferenceIndex | null = null;

export class UnitReferenceDiagnosticProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(UNIT_REFERENCE_DIAGNOSTIC_SOURCE);
  }

  dispose(): void {
    this.collection.dispose();
  }

  async refresh(document: vscode.TextDocument): Promise<void> {
    if (!isIniDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }

    const unitIndex = await scanWorkspaceUnitNames();
    if (unitIndex.size === 0) {
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
      const line = document.lineAt(lineNumber).text;
      const parsed = parseReferenceLine(line);
      if (!parsed) {
        continue;
      }

      for (const token of findUnitReferenceTokens(parsed.value, parsed.valueStart)) {
        if (shouldSkipReferenceToken(token.text)) {
          continue;
        }

        if (unitIndex.has(token.text)) {
          continue;
        }

        const range = new vscode.Range(
          new vscode.Position(lineNumber, token.start),
          new vscode.Position(lineNumber, token.end)
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          t('unitRefNotFound', token.text),
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = UNIT_REFERENCE_DIAGNOSTIC_SOURCE;
        diagnostics.push(diagnostic);
      }
    }

    this.collection.set(document.uri, diagnostics);
  }
}

async function scanWorkspaceUnitNames(): Promise<Set<string>> {
  if (unitIndexCache && Date.now() - unitIndexCache.time < CACHE_TTL) {
    return unitIndexCache.units;
  }

  const units = new Set<string>();
  const uris = await findUnitFiles();

  for (const uri of uris.slice(0, MAX_SCAN_FILES)) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      for (const name of extractUnitNames(content, uri)) {
        const cleanName = cleanValue(name);
        if (cleanName) {
          units.add(cleanName);
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

  return {
    value: stripInlineComment(line.slice(valueStart)),
    valueStart,
  };
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

function findUnitReferenceTokens(value: string, offset: number): UnitReferenceToken[] {
  const tokens: UnitReferenceToken[] = [];

  for (const part of splitReferenceParts(value)) {
    const token = parseLeadingUnitToken(part.text, offset + part.start);
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

function splitReferenceParts(value: string): Array<{ text: string; start: number }> {
  const parts: Array<{ text: string; start: number }> = [];
  const partRe = /[^,]+/g;
  let match: RegExpExecArray | null;

  while ((match = partRe.exec(value)) !== null) {
    const raw = match[0];
    const leadingSpaces = raw.match(/^\s*/)?.[0].length || 0;
    const text = raw.slice(leadingSpaces);
    if (text.trim()) {
      parts.push({
        text,
        start: match.index + leadingSpaces,
      });
    }
  }

  return parts;
}

function parseLeadingUnitToken(text: string, absoluteStart: number): UnitReferenceToken | null {
  const match = text.match(/^(['"]?)([^\s,;#'"()*]+)\1/);
  if (!match) {
    return null;
  }

  const quoteLength = match[1] ? 1 : 0;
  const unitName = cleanValue(match[2]);
  if (!unitName) {
    return null;
  }

  return {
    text: unitName,
    start: absoluteStart + quoteLength,
    end: absoluteStart + quoteLength + match[2].length,
  };
}

function stripInlineComment(value: string): string {
  const commentIndex = value.search(/\s[;#]/);
  return commentIndex >= 0 ? value.slice(0, commentIndex) : value;
}

function cleanValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function shouldSkipReferenceToken(text: string): boolean {
  const lower = text.toLowerCase();
  return IGNORED_REFERENCE_VALUES.has(lower)
    || text.includes('${')
    || text.includes('%{')
    || text.startsWith('@');
}

function isIniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'rusted-warfare' || document.languageId === 'ini';
}

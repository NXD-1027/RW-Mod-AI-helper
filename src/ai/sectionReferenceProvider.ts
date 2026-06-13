import * as vscode from 'vscode';
import { t } from '../i18n';

const DIAGNOSTIC_SOURCE = 'rwMod-section-references';

const PROJECTILE_REFERENCE_FIELDS = new Set([
  'projectile',
  'altprojectile',
  'fireturretxatgroundwithprojectile',
]);

const PROJECTILE_LIST_FIELDS = new Set([
  'spawnprojectileoncreate',
  'spawnprojectilesoncreate',
  'spawnprojectileonendoflife',
  'spawnprojectilesonendoflife',
  'spawnprojectileonexplode',
  'spawnprojectilesonexplode',
  'spawnprojectileonhit',
  'spawnprojectilesonhit',
]);

const TURRET_REFERENCE_FIELDS = new Set([
  'attachedto',
  'linkdelaywithturret',
  'basepositionfromturret',
  'fireturretxatselfondeath',
  'fireturretxatground',
]);

interface SectionRef {
  id: string;
  sectionName: string;
  line: number;
}

interface ParsedLine {
  key: string;
  value: string;
  valueStart: number;
}

interface RefToken {
  text: string;
  start: number;
  end: number;
  kind: RefKind;
}

type RefKind = 'projectile' | 'turret';

interface SectionIndex {
  projectiles: Map<string, SectionRef>;
  turrets: Map<string, SectionRef>;
}

export class SectionReferenceDiagnosticProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  dispose(): void {
    this.collection.dispose();
  }

  refresh(document: vscode.TextDocument): void {
    if (!isIniDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }

    this.collection.set(document.uri, analyzeSectionReferences(document));
  }
}

export class SectionReferenceCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    if (!isIniDocument(document)) {
      return [];
    }

    const line = document.lineAt(position.line).text;
    const parsed = parseLinePrefix(line, position.character);
    if (!parsed) {
      return [];
    }

    const kind = getReferenceKind(parsed.key, findReferenceSectionKindAtLine(document, position.line));
    if (!kind) {
      return [];
    }

    const index = buildSectionIndex(document);
    const entries = kind === 'projectile'
      ? [...index.projectiles.values()]
      : [...index.turrets.values()];

    const currentToken = currentValueToken(parsed.value);
    const range = new vscode.Range(
      new vscode.Position(position.line, parsed.valueStart + parsed.value.length - currentToken.length),
      position,
    );

    return entries.map(entry => {
      const item = new vscode.CompletionItem(entry.id, vscode.CompletionItemKind.Reference);
      item.detail = kind === 'projectile' ? t('projectileRef') : t('turretRef');
      item.documentation = `[${entry.sectionName}]`;
      item.insertText = entry.id;
      item.range = range;
      item.sortText = entry.id.padStart(8, '0');
      return item;
    });
  }
}

export class SectionReferenceDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentLink[] {
    if (!isIniDocument(document)) {
      return [];
    }

    const index = buildSectionIndex(document);
    const links: vscode.DocumentLink[] = [];

    forEachReferenceToken(document, (lineNumber, token) => {
      const target = resolveReference(index, token.kind, token.text);
      if (!target) {
        return;
      }

      const range = new vscode.Range(lineNumber, token.start, lineNumber, token.end);
      const link = new vscode.DocumentLink(
        range,
        document.uri.with({ fragment: `L${target.line + 1},1` }),
      );
      link.tooltip = t('jumpToSection', `[${target.sectionName}]`);
      links.push(link);
    });

    return links;
  }
}

export class SectionReferenceQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (!isIniDocument(document)) {
      return [];
    }

    const relatedDiagnostics = context.diagnostics.filter(diagnostic =>
      diagnostic.source === DIAGNOSTIC_SOURCE && diagnostic.range.intersection(range),
    );
    if (relatedDiagnostics.length === 0) {
      return [];
    }

    const token = findReferenceTokenAtRange(document, relatedDiagnostics[0].range);
    if (!token) {
      return [];
    }

    const index = buildSectionIndex(document);
    const entries = token.kind === 'projectile'
      ? [...index.projectiles.values()]
      : [...index.turrets.values()];
    if (entries.length === 0) {
      return [];
    }

    const currentRef = findReferenceSectionKindAtLine(document, relatedDiagnostics[0].range.start.line);
    const currentSection = findReferenceSectionAtLine(document, relatedDiagnostics[0].range.start.line);
    const sorted = sortBySimilarity(entries, token.text, currentRef ? currentSection?.id : undefined);

    return sorted
      .slice(0, 8)
      .map((entry, index) => {
        const isSelfReference = currentSection?.kind === token.kind
          && entry.id.toLowerCase() === currentSection.id.toLowerCase();
        const action = new vscode.CodeAction(
          `替换为 ${token.kind === 'projectile' ? '弹道' : '炮塔'}引用: ${entry.id}${isSelfReference ? '（引用自身，可能递归）' : ''}`,
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = relatedDiagnostics;
        action.isPreferred = index === 0;
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, relatedDiagnostics[0].range, entry.id);
        return action;
      });
  }
}

function analyzeSectionReferences(document: vscode.TextDocument): vscode.Diagnostic[] {
  const index = buildSectionIndex(document);
  const diagnostics: vscode.Diagnostic[] = [];

  forEachReferenceToken(document, (lineNumber, token) => {
    if (resolveReference(index, token.kind, token.text)) {
      return;
    }

    const range = new vscode.Range(lineNumber, token.start, lineNumber, token.end);
    const diagnostic = new vscode.Diagnostic(
      range,
      token.kind === 'projectile'
        ? t('projectileRefNotFound', token.text)
        : t('turretRefNotFound', token.text),
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostics.push(diagnostic);
  });

  return diagnostics;
}

function findReferenceTokenAtRange(document: vscode.TextDocument, range: vscode.Range): RefToken | null {
  let found: RefToken | null = null;
  forEachReferenceToken(document, (lineNumber, token) => {
    if (found || lineNumber !== range.start.line) {
      return;
    }
    if (token.start === range.start.character && token.end === range.end.character) {
      found = token;
    }
  });
  return found;
}

function sortBySimilarity(entries: SectionRef[], target: string, currentSectionId?: string): SectionRef[] {
  return [...entries].sort((a, b) => {
    const scoreA = similarityScore(a.id, target, currentSectionId);
    const scoreB = similarityScore(b.id, target, currentSectionId);
    return scoreB - scoreA || a.id.localeCompare(b.id);
  });
}

function similarityScore(candidate: string, target: string, currentSectionId?: string): number {
  const a = candidate.toLowerCase();
  const b = target.toLowerCase();
  const targets = new Set([
    b,
    b.replace(/^(missing|unknown|invalid)[_\-.]+/, ''),
  ]);
  if (a === b) return 1000;
  if ([...targets].some(value => value && value === a)) return 950;
  if ([...targets].some(value => value && (value.endsWith(a) || a.endsWith(value)))) return 900 - Math.abs(a.length - b.length);
  if (a.includes(b) || b.includes(a)) return 800 - Math.abs(a.length - b.length);

  let score = 0;
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) score += 3;
  }

  const aParts = new Set(a.split(/[_\-.]+/).filter(Boolean));
  for (const part of b.split(/[_\-.]+/).filter(Boolean)) {
    if (aParts.has(part)) score += 10;
  }

  if (currentSectionId && a === currentSectionId.toLowerCase()) {
    score -= 120;
  }

  return score - Math.abs(a.length - b.length);
}

function findReferenceSectionAtLine(document: vscode.TextDocument, lineNumber: number): { kind: RefKind; id: string } | null {
  for (let i = lineNumber; i >= 0; i--) {
    const match = document.lineAt(i).text.trim().match(/^\[([^\]]+)\]\s*$/);
    if (match) {
      return parseReferenceSection(match[1].trim());
    }
  }
  return null;
}

function forEachReferenceToken(
  document: vscode.TextDocument,
  onToken: (lineNumber: number, token: RefToken) => void,
): void {
  let currentSectionKind: RefKind | null = null;

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const line = document.lineAt(lineNumber).text;
    const sectionMatch = line.trim().match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      currentSectionKind = parseReferenceSection(sectionMatch[1].trim())?.kind || null;
      continue;
    }

    const parsed = parseKeyValueLine(line);
    if (!parsed) {
      continue;
    }

    for (const token of extractReferenceTokens(parsed, currentSectionKind)) {
      onToken(lineNumber, token);
    }
  }
}

function buildSectionIndex(document: vscode.TextDocument): SectionIndex {
  const projectiles = new Map<string, SectionRef>();
  const turrets = new Map<string, SectionRef>();

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const match = document.lineAt(lineNumber).text.trim().match(/^\[([^\]]+)\]\s*$/);
    if (!match) {
      continue;
    }

    const sectionName = match[1].trim();
    const parsed = parseReferenceSection(sectionName);
    if (!parsed) {
      continue;
    }

    const map = parsed.kind === 'projectile' ? projectiles : turrets;
    map.set(parsed.id.toLowerCase(), {
      id: parsed.id,
      sectionName,
      line: lineNumber,
    });
  }

  return { projectiles, turrets };
}

function parseReferenceSection(sectionName: string): { kind: RefKind; id: string } | null {
  const lower = sectionName.toLowerCase();
  if (lower === 'projectile') {
    return { kind: 'projectile', id: 'projectile' };
  }
  if (lower.startsWith('projectile_')) {
    return { kind: 'projectile', id: sectionName.slice('projectile_'.length) };
  }
  if (lower === 'turret') {
    return { kind: 'turret', id: 'turret' };
  }
  if (lower.startsWith('turret_')) {
    return { kind: 'turret', id: sectionName.slice('turret_'.length) };
  }
  return null;
}

function parseKeyValueLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
    return null;
  }

  const match = line.match(/^(\s*)([^:=#;]+?)\s*[:=]\s*(.*)$/);
  if (!match) {
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
    key: normalizeKey(match[2]),
    value: stripInlineComment(line.slice(valueStart)),
    valueStart,
  };
}

function parseLinePrefix(line: string, positionCharacter: number): ParsedLine | null {
  const prefix = line.slice(0, positionCharacter);
  const separatorIndex = findSeparatorIndex(prefix);
  if (separatorIndex < 0) {
    return null;
  }

  let valueStart = separatorIndex + 1;
  while (valueStart < prefix.length && /\s/.test(prefix[valueStart])) {
    valueStart++;
  }

  return {
    key: normalizeKey(prefix.slice(0, separatorIndex)),
    value: prefix.slice(valueStart),
    valueStart,
  };
}

function extractReferenceTokens(parsed: ParsedLine, currentSectionKind: RefKind | null): RefToken[] {
  const kind = getReferenceKind(parsed.key, currentSectionKind);
  if (!kind) {
    return [];
  }

  if (PROJECTILE_LIST_FIELDS.has(parsed.key)) {
    return extractListTokens(parsed.value, parsed.valueStart, kind);
  }

  const token = parseSingleReference(parsed.value, parsed.valueStart, kind);
  return token ? [token] : [];
}

function getReferenceKind(key: string, currentSectionKind: RefKind | null): RefKind | null {
  if (key === 'copyfrom' && currentSectionKind) {
    return currentSectionKind;
  }
  if (PROJECTILE_REFERENCE_FIELDS.has(key) || PROJECTILE_LIST_FIELDS.has(key)) {
    return 'projectile';
  }
  if (TURRET_REFERENCE_FIELDS.has(key)) {
    return 'turret';
  }
  return null;
}

function findReferenceSectionKindAtLine(document: vscode.TextDocument, lineNumber: number): RefKind | null {
  for (let i = lineNumber; i >= 0; i--) {
    const match = document.lineAt(i).text.trim().match(/^\[([^\]]+)\]\s*$/);
    if (match) {
      return parseReferenceSection(match[1].trim())?.kind || null;
    }
  }
  return null;
}

function extractListTokens(value: string, offset: number, kind: RefKind): RefToken[] {
  const tokens: RefToken[] = [];
  const partRe = /[^,]+/g;
  let match: RegExpExecArray | null;

  while ((match = partRe.exec(value)) !== null) {
    const leading = match[0].match(/^\s*/)?.[0].length || 0;
    const token = parseSingleReference(match[0].slice(leading), offset + match.index + leading, kind);
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

function parseSingleReference(value: string, offset: number, kind: RefKind): RefToken | null {
  const match = value.match(/^(['"]?)([A-Za-z0-9_.-]+)\1/);
  if (!match) {
    return null;
  }

  const text = match[2];
  if (shouldSkipToken(text)) {
    return null;
  }

  const quoteOffset = match[1] ? 1 : 0;
  return {
    text,
    start: offset + quoteOffset,
    end: offset + quoteOffset + text.length,
    kind,
  };
}

function resolveReference(index: SectionIndex, kind: RefKind, rawText: string): SectionRef | undefined {
  const map = kind === 'projectile' ? index.projectiles : index.turrets;
  const normalized = rawText.toLowerCase();
  return map.get(normalized)
    || map.get(normalized.replace(new RegExp(`^${kind}_`, 'i'), ''));
}

function shouldSkipToken(text: string): boolean {
  const lower = text.toLowerCase();
  return lower === 'none'
    || lower === 'auto'
    || lower === 'true'
    || lower === 'false'
    || text.includes('${')
    || text.includes('%{')
    || text.startsWith('@')
    || /^(root|custom|shared):/i.test(text);
}

function currentValueToken(value: string): string {
  const match = value.match(/[A-Za-z0-9_.-]*$/);
  return match ? match[0] : '';
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

function isIniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'rusted-warfare' || document.languageId === 'ini';
}

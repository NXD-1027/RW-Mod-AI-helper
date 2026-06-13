import * as vscode from 'vscode';
import { getSectionFields, SECTIONS, findSectionAtLine } from './completionProvider';
import { t } from '../i18n';

export const UNKNOWN_FIELD_DIAGNOSTIC_SOURCE = 'rwMod-fields';

const DIRECTIVE_RE = /^@(memory|define|global|copyfromsection|copyfrom_skipthissection)\b/i;
const MAX_SUGGESTIONS = 5;

interface ParsedKeyLine {
  key: string;
  keyStart: number;
  keyEnd: number;
  separator: string;
  separatorStart: number;
  value: string;
}

interface FieldCandidate {
  name: string;
  section: string;
  score: number;
}

export class UnknownFieldDiagnosticProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(UNKNOWN_FIELD_DIAGNOSTIC_SOURCE);
  }

  dispose(): void {
    this.collection.dispose();
  }

  refresh(document: vscode.TextDocument): void {
    if (!isIniDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }

    this.collection.set(document.uri, analyzeUnknownFields(document));
  }
}

export function analyzeUnknownFields(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
    const lineText = document.lineAt(lineNumber).text;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || isSectionLine(trimmed)) {
      continue;
    }

    if (DIRECTIVE_RE.test(trimmed)) {
      continue;
    }

    const parsed = parseKeyLine(lineText);
    if (!parsed) {
      continue;
    }

    const section = findSectionAtLine(document, lineNumber);
    if (!section || shouldSkipSection(section)) {
      continue;
    }

    if (parsed.separator === '：') {
      const range = new vscode.Range(lineNumber, parsed.separatorStart, lineNumber, parsed.separatorStart + 1);
      const diagnostic = new vscode.Diagnostic(
        range,
        t('chineseColon'),
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = UNKNOWN_FIELD_DIAGNOSTIC_SOURCE;
      diagnostic.code = 'chinese-colon';
      diagnostics.push(diagnostic);
      continue;
    }

    const fields = getSectionFields(section);
    if (fields.length === 0) {
      continue;
    }

    const exact = fields.find(field => field.label === parsed.key);
    if (exact) {
      continue;
    }

    const lowerMatch = fields.find(field => field.label.toLowerCase() === parsed.key.toLowerCase());
    const range = new vscode.Range(lineNumber, parsed.keyStart, lineNumber, parsed.keyEnd);
    if (lowerMatch) {
      const diagnostic = new vscode.Diagnostic(
        range,
        t('fieldCaseMismatch', parsed.key, lowerMatch.label),
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = UNKNOWN_FIELD_DIAGNOSTIC_SOURCE;
      diagnostic.code = makeFixCode([lowerMatch.label]);
      diagnostics.push(diagnostic);
      continue;
    }

    const knownElsewhere = findSectionsForField(parsed.key);
    const suggestions = suggestFields(section, parsed.key);
    const diagnostic = new vscode.Diagnostic(
      range,
      knownElsewhere.length > 0
        ? t('fieldWrongSection', parsed.key, `[${section}]`, knownElsewhere.map(s => `[${s}]`).join(', '))
        : t('unknownField', parsed.key, `[${section}]`),
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = UNKNOWN_FIELD_DIAGNOSTIC_SOURCE;
    diagnostic.code = makeFixCode(suggestions.map(s => s.name));
    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

export class UnknownFieldQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (!isIniDocument(document)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== UNKNOWN_FIELD_DIAGNOSTIC_SOURCE) {
        continue;
      }

      if (diagnostic.code === 'chinese-colon') {
        actions.push(makeReplaceAction(document, diagnostic, ':', t('replaceChineseColon')));
        continue;
      }

      const fixes = parseFixCode(diagnostic.code);
      for (const fix of fixes.slice(0, MAX_SUGGESTIONS)) {
        actions.push(makeReplaceAction(document, diagnostic, fix, t('replaceWith', fix)));
      }
    }

    return actions;
  }
}

function makeReplaceAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  replacement: string,
  title: string,
): vscode.CodeAction {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, diagnostic.range, replacement);

  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.edit = edit;
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  return action;
}

function parseKeyLine(line: string): ParsedKeyLine | null {
  const match = line.match(/^(\s*)([^:=#;]+?)(\s*)([:=：])(.*)$/);
  if (!match) {
    return null;
  }

  const rawKey = match[2];
  const key = rawKey.trim();
  if (!key || key.includes(' ') || key.includes('\t')) {
    return null;
  }

  const keyStart = match[1].length + rawKey.search(/\S/);
  const keyEnd = keyStart + key.length;
  const separatorStart = match[1].length + rawKey.length + match[3].length;

  return {
    key,
    keyStart,
    keyEnd,
    separator: match[4],
    separatorStart,
    value: match[5].trim(),
  };
}

function isSectionLine(text: string): boolean {
  return /^\[[^\]]+\]\s*$/.test(text);
}

function shouldSkipSection(section: string): boolean {
  const lower = section.toLowerCase();
  return lower === 'comment'
    || lower.startsWith('comment_')
    || lower === 'template'
    || lower.startsWith('template_');
}

function findSectionsForField(fieldName: string): string[] {
  const result: string[] = [];
  for (const section of SECTIONS) {
    if (shouldSkipSection(section.name)) {
      continue;
    }

    const fields = getSectionFields(section.name);
    if (fields.some(field => field.label.toLowerCase() === fieldName.toLowerCase())) {
      result.push(section.name);
    }
  }
  return result;
}

function suggestFields(section: string, fieldName: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const seen = new Set<string>();

  function add(sectionName: string, weight: number): void {
    for (const field of getSectionFields(sectionName)) {
      const key = `${sectionName}:${field.label}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const score = similarity(fieldName, field.label) * weight;
      if (score >= 0.55) {
        candidates.push({ name: field.label, section: sectionName, score });
      }
    }
  }

  add(section, 1.0);
  for (const sec of SECTIONS) {
    if (sec.name !== section && !shouldSkipSection(sec.name)) {
      add(sec.name, 0.86);
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS);
}

function similarity(left: string, right: string): number {
  const a = normalizeForCompare(left);
  const b = normalizeForCompare(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[_\s-]/g, '');
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = [];
  for (let j = 0; j <= b.length; j++) {
    dp[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = temp;
    }
  }

  return dp[b.length];
}

function makeFixCode(fixes: string[]): string {
  return `fix:${fixes.join('|')}`;
}

function parseFixCode(code: unknown): string[] {
  if (typeof code !== 'string' || !code.startsWith('fix:')) {
    return [];
  }
  return code.slice(4).split('|').filter(Boolean);
}

function isIniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'rusted-warfare' || document.languageId === 'ini';
}


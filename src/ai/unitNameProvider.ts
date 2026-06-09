import * as vscode from 'vscode';
import { t } from '../i18n';

// 全量扫描缓存（5秒内不重复扫）
let scanCache: { names: string[]; time: number } | null = null;
const CACHE_TTL = 5000;
const MAX_SCAN_FILES = 500;
const BASE_EXTENSIONS = ['ini', 'template'];

/** 触发单位名补全的字段名 */
const UNIT_NAME_FIELDS = new Set([
  'copyfrom',
  'spawnunit', 'spawnunits', 'produceunits', 'converto',
  'unitspawnedondeath', 'upgradedfrom', 'guibuildunit',
  'unitshowninui', 'textaddunitname',
  'addunitsintotransport', 'oncreatespawnunitof',
  'addwaypointunittype',
]);

/**
 * 用 VS Code 搜索索引扫描单位文件中的单位名
 */
async function scanWorkspaceUnitNames(): Promise<string[]> {
  if (scanCache && Date.now() - scanCache.time < CACHE_TTL) {
    return scanCache.names;
  }

  const allNames: string[] = [];
  const seen = new Set<string>();

  const uris = await findUnitFiles();

  for (const uri of uris.slice(0, MAX_SCAN_FILES)) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(bytes).toString('utf8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const displayMatch = content.match(/^displayText:\s*(.+)$/m);

      const name = nameMatch ? cleanValue(nameMatch[1]) : '';
      const displayName = displayMatch ? cleanValue(displayMatch[1]) : '';

      if (name && !seen.has(name)) {
        seen.add(name);
        allNames.push(name);
      }
      if (displayName && !seen.has(displayName)) {
        seen.add(displayName);
        allNames.push(displayName);
      }
    } catch { /* skip unreadable */ }
  }

  scanCache = { names: allNames, time: Date.now() };
  return allNames;
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

function isUnitNameField(line: string): boolean {
  const colon = line.indexOf(':');
  if (colon < 0) return false;
  const key = line.substring(0, colon).trim().toLowerCase().replace(/[_\s]/g, '');
  return UNIT_NAME_FIELDS.has(key) || /^builtfrom.+name$/.test(key);
}

function cleanValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export class UnitNameCompletionProvider implements vscode.CompletionItemProvider {

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    const line = document.lineAt(position).text;
    const colon = line.indexOf(':');
    if (colon < 0 || position.character <= colon + 1) return [];
    if (!isUnitNameField(line)) return [];

    const names = await scanWorkspaceUnitNames();
    if (names.length === 0) {
      const hint = new vscode.CompletionItem(t('noUnitsFound'), vscode.CompletionItemKind.Text);
      hint.insertText = '';
      return [hint];
    }

    return names.map(n => {
      const item = new vscode.CompletionItem(n, vscode.CompletionItemKind.Constant);
      item.detail = t('unitName');
      item.sortText = 'a' + n.toLowerCase();
      return item;
    });
  }
}

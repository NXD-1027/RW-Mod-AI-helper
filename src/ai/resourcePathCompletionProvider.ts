import * as vscode from 'vscode';
import * as path from 'path';
import { t } from '../i18n';

const MAX_RESOURCE_FILES = 1000;
const CACHE_TTL = 5000;

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const AUDIO_EXTENSIONS = ['ogg', 'wav', 'mp3'];
const RESOURCE_EXTENSIONS = [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS];

const FILE_FIELD_NAMES = new Set([
  'image',
  'imageback',
  'imageshield',
  'imagewreak',
  'imageturret',
  'imageshadow',
  'iconzoomedout',
  'iconbuild',
  'iconimage',
  'iconextraimage',
  'playsoundatunit',
  'playsoundglobally',
  'playsoundtoplayer',
  'soundonattackorder',
  'soundonmoveorder',
  'soundonnewselection',
  'shootsound',
]);

interface ResourceEntry {
  uri: vscode.Uri;
  workspacePath?: string;
  currentFilePath?: string;
  basename: string;
  ext: string;
}

let scanCache: { entries: ResourceEntry[]; time: number } | null = null;

export class ResourcePathCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[]> {
    if (!isIniDocument(document)) {
      return [];
    }

    const line = document.lineAt(position).text;
    const parsed = parseResourceLinePrefix(line, position.character);
    if (!parsed) {
      return [];
    }

    const entries = await scanWorkspaceResources(document);
    const wantedType = getWantedResourceType(parsed.key);
    const currentToken = parsed.currentToken.toLowerCase().replace(/^root:/, '');
    const useRootPrefix = /^root:/i.test(parsed.currentToken);

    const filtered = entries
      .filter(entry => wantedType === 'any' || wantedType === entry.extType)
      .filter(entry => matchesCurrentToken(entry, currentToken, useRootPrefix));

    if (filtered.length === 0) {
      const hint = new vscode.CompletionItem(t('noResourcesFound'), vscode.CompletionItemKind.Text);
      hint.insertText = '';
      return [hint];
    }

    const range = new vscode.Range(
      new vscode.Position(position.line, parsed.tokenStart),
      position
    );

    return filtered.slice(0, 200).map(entry => {
      const insertPath = buildInsertPath(entry, useRootPrefix);
      const item = new vscode.CompletionItem(insertPath, getCompletionKind(entry));
      item.insertText = insertPath;
      item.range = range;
      const typeLabel = entry.extType === 'audio' ? '音频资源' : '图片资源';
      item.detail = `${typeLabel} - ${entry.basename}`;
      item.sortText = entry.currentFilePath ? `a_${insertPath}` : `b_${insertPath}`;
      return item;
    });
  }
}

type ResourceType = 'image' | 'audio' | 'any';

interface IndexedResourceEntry extends ResourceEntry {
  extType: 'image' | 'audio';
}

async function scanWorkspaceResources(document: vscode.TextDocument): Promise<IndexedResourceEntry[]> {
  if (scanCache && Date.now() - scanCache.time < CACHE_TTL) {
    return addCurrentFileRelativePaths(document, scanCache.entries);
  }

  const seen = new Set<string>();
  const entries: ResourceEntry[] = [];

  for (const ext of RESOURCE_EXTENSIONS) {
    const files = await vscode.workspace.findFiles(
      `**/*.${ext}`,
      '**/{node_modules,out,.git}/**',
      MAX_RESOURCE_FILES
    );

    for (const uri of files) {
      const key = uri.toString();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      entries.push({
        uri,
        workspacePath: getWorkspaceRelativePath(uri),
        basename: path.basename(uri.fsPath),
        ext,
      });

      if (entries.length >= MAX_RESOURCE_FILES) {
        break;
      }
    }
  }

  scanCache = { entries, time: Date.now() };
  return addCurrentFileRelativePaths(document, entries);
}

function addCurrentFileRelativePaths(document: vscode.TextDocument, entries: ResourceEntry[]): IndexedResourceEntry[] {
  const docDir = path.dirname(document.uri.fsPath);
  return entries.map(entry => ({
    ...entry,
    currentFilePath: toIniPath(path.relative(docDir, entry.uri.fsPath)),
    extType: IMAGE_EXTENSIONS.includes(entry.ext.toLowerCase()) ? 'image' : 'audio',
  }));
}

function parseResourceLinePrefix(
  line: string,
  positionCharacter: number,
): { key: string; currentToken: string; tokenStart: number } | null {
  const prefix = line.slice(0, positionCharacter);
  const separatorIndex = findSeparatorIndex(prefix);
  if (separatorIndex < 0) {
    return null;
  }

  const key = prefix.slice(0, separatorIndex).trim();
  if (!isResourceField(key)) {
    return null;
  }

  const valuePrefix = prefix.slice(separatorIndex + 1);
  const tokenMatch = valuePrefix.match(/(?:ROOT:)?[^\s,;#'"]*$/i);
  const currentToken = tokenMatch ? tokenMatch[0] : '';
  return {
    key,
    currentToken,
    tokenStart: positionCharacter - currentToken.length,
  };
}

function isIniDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'rusted-warfare' || document.languageId === 'ini';
}

function isResourceField(key: string): boolean {
  const normalized = normalizeKey(key);
  return FILE_FIELD_NAMES.has(normalized)
    || normalized.includes('image')
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

function getWantedResourceType(key: string): ResourceType {
  const normalized = normalizeKey(key);
  if (normalized.includes('sound')) {
    return 'audio';
  }
  if (normalized.includes('image') || normalized.includes('icon')) {
    return 'image';
  }
  return 'any';
}

function matchesCurrentToken(entry: ResourceEntry, currentToken: string, useRootPrefix: boolean): boolean {
  if (!currentToken) {
    return true;
  }

  const candidate = (useRootPrefix ? entry.workspacePath : entry.currentFilePath) || '';
  return candidate.toLowerCase().includes(currentToken)
    || entry.basename.toLowerCase().includes(currentToken);
}

function buildInsertPath(entry: ResourceEntry, useRootPrefix: boolean): string {
  const resourcePath = useRootPrefix
    ? entry.workspacePath || entry.currentFilePath || entry.basename
    : entry.currentFilePath || entry.workspacePath || entry.basename;

  return useRootPrefix ? `ROOT:${resourcePath}` : resourcePath;
}

function getWorkspaceRelativePath(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return undefined;
  }
  return toIniPath(path.relative(folder.uri.fsPath, uri.fsPath));
}

function toIniPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getCompletionKind(entry: IndexedResourceEntry): vscode.CompletionItemKind {
  return entry.extType === 'audio'
    ? vscode.CompletionItemKind.File
    : vscode.CompletionItemKind.Color;
}

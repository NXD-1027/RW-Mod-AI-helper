import * as vscode from 'vscode';
import * as path from 'path';

interface UnitSummary {
  uri: vscode.Uri;
  fileName: string;
  name: string;
  displayText: string;
  maxHp?: number;
  price?: number;
  buildSpeed?: string;
  movementType: string;
  moveSpeed?: number;
  maxAttackRange?: number;
  shootDelay?: number;
  directDamage?: number;
  areaDamage?: number;
  sections: string[];
  resources: string[];
  copyFroms: string[];
}

interface ResourceEntry {
  uri: vscode.Uri;
  workspacePath: string;
  ext: string;
  size: number;
}

const UNIT_EXTENSIONS = ['ini', 'template'];
const RESOURCE_EXTENSIONS = ['png', 'ogg', 'wav'];
const MAX_FILES = 2000;
const LARGE_PNG_BYTES = 512 * 1024;

export function registerLocalTools(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.showUnitList', async () => showUnitList()),
    vscode.commands.registerCommand('rwMod.showModOverview', async () => showModOverview()),
    vscode.commands.registerCommand('rwMod.findUnusedResources', async () => findUnusedResources()),
    vscode.commands.registerCommand('rwMod.bulkAdjustBalance', async () => bulkAdjustBalance()),
    vscode.commands.registerCommand('rwMod.safeRenameSymbol', async () => safeRenameSymbol()),
    vscode.commands.registerCommand('rwMod.exportModDocs', async () => exportModDocs()),
    vscode.commands.registerCommand('rwMod.openUnitWizard', async () => openUnitWizard()),
    vscode.commands.registerCommand('rwMod.generateModInfo', async () => generateModInfo()),
    vscode.commands.registerCommand('rwMod.runBattleSimulator', async () => runBattleSimulator()),
    vscode.commands.registerCommand('rwMod.insertBuiltinTemplate', async () => insertBuiltinTemplate()),
    vscode.commands.registerCommand('rwMod.addBookmark', async () => addBookmark(context)),
    vscode.commands.registerCommand('rwMod.listBookmarks', async () => listBookmarks(context)),
  );
}

async function showUnitList(): Promise<void> {
  const units = await scanWorkspaceUnits();
  if (units.length === 0) {
    vscode.window.showInformationMessage('未在工作区发现单位 INI 文件');
    return;
  }

  const picks = units
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(unit => ({
      label: unit.displayText || unit.name,
      description: unit.movementType || 'UNKNOWN',
      detail: `HP ${fmt(unit.maxHp)} | 造价 ${fmt(unit.price)} | 速度 ${fmt(unit.moveSpeed)} | ${unit.fileName}`,
      unit,
    }));

  const pick = await vscode.window.showQuickPick(picks, {
    placeHolder: '选择单位并跳转到文件',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) return;

  const doc = await vscode.workspace.openTextDocument(pick.unit.uri);
  await vscode.window.showTextDocument(doc);
}

async function showModOverview(): Promise<void> {
  const [units, resources] = await Promise.all([scanWorkspaceUnits(), scanWorkspaceResources()]);
  const byMovement = groupBy(units, unit => unit.movementType || 'UNKNOWN');
  const images = resources.filter(r => r.ext === 'png');
  const audio = resources.filter(r => r.ext === 'ogg' || r.ext === 'wav');
  const totalSize = resources.reduce((sum, r) => sum + r.size, 0);

  const lines = [
    '# MOD 体检概览',
    '',
    '> 面向排查和优化：统计单位数量、资源体积、资源类型分布和主要数值概况。',
    '',
    `- 单位文件：${units.length}`,
    `- 资源文件：${resources.length}`,
    `- 图片：${images.length}`,
    `- 音频：${audio.length}`,
    `- 资源总大小：${formatBytes(totalSize)}`,
    '',
    '## 单位类型',
    '',
    ...[...byMovement.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([type, group]) => `- ${type}: ${group.length}`),
    '',
    '## 数值摘要',
    '',
    '| 单位 | 类型 | HP | 造价 | 速度 | 射程 | 伤害 | 文件 |',
    '|------|------|----|------|------|------|------|------|',
    ...units
      .sort((a, b) => (b.price || 0) - (a.price || 0))
      .slice(0, 80)
      .map(unit => `| ${escapeMd(unit.displayText || unit.name)} | ${unit.movementType || ''} | ${fmt(unit.maxHp)} | ${fmt(unit.price)} | ${fmt(unit.moveSpeed)} | ${fmt(unit.maxAttackRange)} | ${fmt(unit.directDamage || unit.areaDamage)} | ${escapeMd(unit.fileName)} |`),
  ];

  await showMarkdownReport('MOD 体检概览', lines.join('\n'));
}

async function findUnusedResources(): Promise<void> {
  const [units, resources] = await Promise.all([scanWorkspaceUnits(), scanWorkspaceResources()]);
  const referenced = new Set<string>();

  for (const unit of units) {
    for (const resource of unit.resources) {
      referenced.add(normalizePath(resource));
      referenced.add(normalizePath(path.basename(resource)));
    }
  }

  const unused = resources.filter(resource => {
    const normalized = normalizePath(resource.workspacePath);
    return !referenced.has(normalized) && !referenced.has(normalizePath(path.basename(resource.workspacePath)));
  });
  const largePngs = resources.filter(resource => resource.ext === 'png' && resource.size >= LARGE_PNG_BYTES);

  const lines = [
    '# 未使用资源检测',
    '',
    `- 扫描资源：${resources.length}`,
    `- INI 引用资源：${referenced.size}`,
    `- 疑似未使用：${unused.length}`,
    `- 大 PNG：${largePngs.length}`,
    '',
    '## 疑似未使用资源',
    '',
    ...tableOrEmpty(
      unused.slice(0, 200),
      '| 路径 | 类型 | 大小 |',
      '|------|------|------|',
      r => `| ${escapeMd(r.workspacePath)} | ${r.ext} | ${formatBytes(r.size)} |`,
    ),
    '',
    '## 资源压缩建议',
    '',
    ...tableOrEmpty(
      largePngs.slice(0, 100),
      '| 路径 | 大小 | 建议 |',
      '|------|------|------|',
      r => `| ${escapeMd(r.workspacePath)} | ${formatBytes(r.size)} | PNG 偏大，可考虑压缩 |`,
    ),
  ];

  await showMarkdownReport('未使用资源检测', lines.join('\n'));
}

async function bulkAdjustBalance(): Promise<void> {
  const field = await vscode.window.showQuickPick(
    ['maxHp', 'price', 'moveSpeed', 'maxAttackRange', 'shootDelay'],
    { placeHolder: '选择要批量调整的字段' },
  );
  if (!field) return;

  const mode = await vscode.window.showQuickPick(
    [
      { label: '乘以倍率', value: 'mul' },
      { label: '增加固定值', value: 'add' },
      { label: '设置为固定值', value: 'set' },
    ],
    { placeHolder: '选择调整方式' },
  );
  if (!mode) return;

  const rawValue = await vscode.window.showInputBox({
    prompt: mode.value === 'mul' ? '输入倍率，如 1.2' : '输入数值',
    validateInput: value => Number.isFinite(Number(value)) ? null : '请输入数字',
  });
  if (!rawValue) return;
  const value = Number(rawValue);

  const units = await scanWorkspaceUnits();
  const picks = await vscode.window.showQuickPick(
    units.map(unit => ({
      label: unit.displayText || unit.name,
      description: `${field}: ${fmt((unit as any)[field])}`,
      detail: unit.fileName,
      unit,
    })),
    { canPickMany: true, placeHolder: '选择要调整的单位' },
  );
  if (!picks || picks.length === 0) return;

  const edit = new vscode.WorkspaceEdit();
  let changed = 0;
  for (const pick of picks) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(pick.unit.uri)).toString('utf8');
    const next = replaceNumericField(text, field, current => {
      if (mode.value === 'mul') return current * value;
      if (mode.value === 'add') return current + value;
      return value;
    });
    if (next !== text) {
      edit.replace(pick.unit.uri, fullRange(text), next);
      changed++;
    }
  }

  if (changed === 0) {
    vscode.window.showInformationMessage(`选中单位中没有可调整的 ${field}`);
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `即将修改 ${changed} 个文件的 ${field}，是否继续？`,
    { modal: true },
    '应用',
  );
  if (confirm !== '应用') return;

  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(`已批量调整 ${changed} 个单位`);
}

async function safeRenameSymbol(): Promise<void> {
  const oldName = await vscode.window.showInputBox({ prompt: '输入要重命名的单位/炮塔/弹道 ID' });
  if (!oldName) return;
  const newName = await vscode.window.showInputBox({ prompt: `将 ${oldName} 重命名为` });
  if (!newName || newName === oldName) return;

  const files = await findUnitFiles();
  const edit = new vscode.WorkspaceEdit();
  let changedFiles = 0;

  for (const uri of files) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const next = replaceSymbolSafely(text, oldName, newName);
    if (next !== text) {
      edit.replace(uri, fullRange(text), next);
      changedFiles++;
    }
  }

  if (changedFiles === 0) {
    vscode.window.showInformationMessage(`未找到引用: ${oldName}`);
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `将 ${oldName} 替换为 ${newName}，影响 ${changedFiles} 个文件。是否应用？`,
    { modal: true },
    '应用',
  );
  if (confirm !== '应用') return;

  await vscode.workspace.applyEdit(edit);
  vscode.window.showInformationMessage(`已完成安全重命名：${changedFiles} 个文件`);
}

async function exportModDocs(): Promise<void> {
  const units = await scanWorkspaceUnits();
  const lines = [
    '# MOD 单位文档',
    '',
    '> 面向发布和整理：按单位列出核心属性、文件位置和 copyFrom 继承线索。',
    '',
    `导出单位数：${units.length}`,
    '',
    '| 单位 | 显示名 | 类型 | HP | 造价 | 速度 | buildSpeed | 文件 |',
    '|------|--------|------|----|------|------|------------|------|',
    ...units
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(unit => `| ${escapeMd(unit.name)} | ${escapeMd(unit.displayText)} | ${unit.movementType} | ${fmt(unit.maxHp)} | ${fmt(unit.price)} | ${fmt(unit.moveSpeed)} | ${escapeMd(unit.buildSpeed || '')} | ${escapeMd(unit.fileName)} |`),
    '',
    '## CopyFrom 继承线索',
    '',
    ...units.flatMap(unit => {
      const copies = extractCopyFromsFromUnit(unit);
      return copies.length > 0 ? [`- ${unit.name}: ${copies.join(', ')}`] : [];
    }),
  ];

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join('\n'),
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc);
}

async function openUnitWizard(): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: '单位内部名 name', placeHolder: 'my_tank' });
  if (!name) return;
  const displayText = await vscode.window.showInputBox({ prompt: '显示名 displayText', value: name });
  const movementType = await vscode.window.showQuickPick(['LAND', 'HOVER', 'AIR', 'WATER', 'NONE', 'OVER_CLIFF', 'OVER_CLIFF_WATER'], { placeHolder: '移动类型' });
  if (!movementType) return;
  const hp = await inputNumber('maxHp', '500');
  const price = await inputNumber('price', '700');
  const speed = await inputNumber('moveSpeed', movementType === 'NONE' ? '0' : '1.0');
  const image = await vscode.window.showInputBox({ prompt: '主体图片路径 image', value: `${name}.png` });

  const content = [
    '[core]',
    `name: ${name}`,
    `displayText: ${displayText || name}`,
    'class: CustomUnitMetadata',
    `price: ${price}`,
    `maxHp: ${hp}`,
    'mass: 500',
    'techLevel: 1',
    'buildSpeed: 0.0015',
    'radius: 12',
    '',
    '[graphics]',
    'total_frames: 1',
    `image: ${image || `${name}.png`}`,
    'image_shadow: AUTO',
    '',
    '[attack]',
    'canAttack: true',
    'canAttackFlyingUnits: true',
    'canAttackLandUnits: true',
    'canAttackUnderwaterUnits: false',
    'maxAttackRange: 120',
    'shootDelay: 50',
    '',
    '[turret_1]',
    'x: 0',
    'y: 0',
    'projectile: 1',
    '',
    '[projectile_1]',
    'directDamage: 20',
    'life: 70',
    'speed: 6',
    '',
    '[movement]',
    `movementType: ${movementType}`,
    `moveSpeed: ${speed}`,
    'moveAccelerationSpeed: 0.03',
    'moveDecelerationSpeed: 0.06',
    'maxTurnSpeed: 2.4',
    'turnAcceleration: 0.2',
    '',
  ].join('\n');

  const doc = await vscode.workspace.openTextDocument({ content, language: 'rusted-warfare' });
  await vscode.window.showTextDocument(doc);
}

async function generateModInfo(): Promise<void> {
  const title = await vscode.window.showInputBox({ prompt: 'MOD 名称 title' });
  if (!title) return;
  const description = await vscode.window.showInputBox({ prompt: 'MOD 描述 description', value: 'A Rusted Warfare mod.' });
  const minVersion = await vscode.window.showInputBox({ prompt: '最低版本 minVersion', value: '1.15' });
  const content = [
    '[mod]',
    `title: ${title}`,
    `description: ${description || ''}`,
    'tags: units',
    `minVersion: ${minVersion || '1.15'}`,
    '',
  ].join('\n');
  const doc = await vscode.workspace.openTextDocument({ content, language: 'ini' });
  await vscode.window.showTextDocument(doc);
}

async function runBattleSimulator(): Promise<void> {
  const units = await scanWorkspaceUnits();
  const picks = await vscode.window.showQuickPick(
    units.map(unit => ({
      label: unit.displayText || unit.name,
      detail: `HP ${fmt(unit.maxHp)} | 伤害 ${fmt(unit.directDamage || unit.areaDamage)} | 延迟 ${fmt(unit.shootDelay)} | ${unit.fileName}`,
      unit,
    })),
    { canPickMany: true, placeHolder: '选择两个单位进行简化对攻模拟' },
  );
  if (!picks || picks.length !== 2) {
    vscode.window.showWarningMessage('请选择正好两个单位');
    return;
  }

  const [a, b] = picks.map(p => p.unit);
  const resultA = estimateCombat(a, b);
  const resultB = estimateCombat(b, a);
  const winner = resultA.ttk < resultB.ttk ? a : resultB.ttk < resultA.ttk ? b : null;

  await showMarkdownReport('伤害/战斗模拟器', [
    '# 伤害/战斗模拟器',
    '',
    '> 简化模拟：按 HP、directDamage/areaDamage、shootDelay 估算 DPS 和 TTK，不模拟弹道、射程移动、护盾、装甲和特殊逻辑。',
    '',
    `- ${a.displayText || a.name} DPS: ${resultA.dps.toFixed(2)}，击杀 ${b.displayText || b.name}: ${formatSeconds(resultA.ttk)}`,
    `- ${b.displayText || b.name} DPS: ${resultB.dps.toFixed(2)}，击杀 ${a.displayText || a.name}: ${formatSeconds(resultB.ttk)}`,
    `- 估算结果：${winner ? `${winner.displayText || winner.name} 优势` : '接近持平'}`,
  ].join('\n'));
}

async function insertBuiltinTemplate(): Promise<void> {
  const templates = getBuiltinTemplates();
  const pick = await vscode.window.showQuickPick(Object.keys(templates), { placeHolder: '选择要插入的模板' });
  if (!pick) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    const doc = await vscode.workspace.openTextDocument({ content: templates[pick], language: 'rusted-warfare' });
    await vscode.window.showTextDocument(doc);
    return;
  }

  await editor.insertSnippet(new vscode.SnippetString(templates[pick]));
}

interface BookmarkEntry {
  label: string;
  uri: string;
  line: number;
  character: number;
}

async function addBookmark(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('请先打开一个 INI 文件');
    return;
  }

  const defaultLabel = findNearestSectionName(editor.document, editor.selection.active.line)
    || path.basename(editor.document.uri.fsPath);
  const label = await vscode.window.showInputBox({
    prompt: '输入书签别名',
    value: defaultLabel,
  });
  if (!label) return;

  const bookmarks = context.workspaceState.get<BookmarkEntry[]>('rwMod.bookmarks', []);
  bookmarks.push({
    label,
    uri: editor.document.uri.toString(),
    line: editor.selection.active.line,
    character: editor.selection.active.character,
  });
  await context.workspaceState.update('rwMod.bookmarks', bookmarks.slice(-200));
  vscode.window.showInformationMessage(`已添加书签: ${label}`);
}

async function listBookmarks(context: vscode.ExtensionContext): Promise<void> {
  const bookmarks = context.workspaceState.get<BookmarkEntry[]>('rwMod.bookmarks', []);
  if (bookmarks.length === 0) {
    vscode.window.showInformationMessage('当前没有书签');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    bookmarks.map((bookmark, index) => ({
      label: bookmark.label,
      description: `${path.basename(vscode.Uri.parse(bookmark.uri).fsPath)}:${bookmark.line + 1}`,
      bookmark,
      index,
    })),
    { placeHolder: '选择书签跳转' },
  );
  if (!pick) return;

  const uri = vscode.Uri.parse(pick.bookmark.uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const position = new vscode.Position(pick.bookmark.line, pick.bookmark.character);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

async function scanWorkspaceUnits(): Promise<UnitSummary[]> {
  const uris = await findUnitFiles();
  const units: UnitSummary[] = [];

  for (const uri of uris) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      const parsed = parseUnit(text, uri);
      if (parsed.name || parsed.sections.length > 0) {
        units.push(parsed);
      }
    } catch {
      // skip unreadable
    }
  }

  return units;
}

async function scanWorkspaceResources(): Promise<ResourceEntry[]> {
  const result: ResourceEntry[] = [];
  const seen = new Set<string>();

  for (const ext of RESOURCE_EXTENSIONS) {
    const files = await vscode.workspace.findFiles(`**/*.${ext}`, '**/{node_modules,out,.git}/**', MAX_FILES);
    for (const uri of files) {
      const key = uri.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        result.push({
          uri,
          workspacePath: getWorkspaceRelativePath(uri),
          ext,
          size: stat.size,
        });
      } catch {
        // skip
      }
    }
  }

  return result;
}

async function findUnitFiles(): Promise<vscode.Uri[]> {
  const result: vscode.Uri[] = [];
  const seen = new Set<string>();
  const exts = getKnownUnitExtensions();

  for (const ext of exts) {
    const files = await vscode.workspace.findFiles(`**/*.${ext}`, '**/{node_modules,out,.git}/**', MAX_FILES);
    for (const uri of files) {
      const key = uri.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(uri);
    }
  }

  return result;
}

function getKnownUnitExtensions(): string[] {
  const exts = new Set(UNIT_EXTENSIONS);
  const assoc = vscode.workspace.getConfiguration().get<Record<string, string>>('files.associations') || {};
  for (const [pattern, languageId] of Object.entries(assoc)) {
    if (languageId !== 'rusted-warfare') continue;
    const match = pattern.match(/^\*\.([a-zA-Z0-9_.-]+)$/);
    if (match) exts.add(match[1].replace(/^\./, ''));
  }
  return [...exts];
}

function parseUnit(text: string, uri: vscode.Uri): UnitSummary {
  const sections = [...text.matchAll(/^\s*\[([^\]]+)\]\s*$/gm)].map(m => m[1].trim());
  const fileName = path.basename(uri.fsPath);
  return {
    uri,
    fileName,
    name: readField(text, 'name') || path.basename(fileName, path.extname(fileName)),
    displayText: readField(text, 'displayText') || '',
    maxHp: readNumberField(text, 'maxHp'),
    price: readPrice(text),
    buildSpeed: readField(text, 'buildSpeed'),
    movementType: readField(text, 'movementType') || 'UNKNOWN',
    moveSpeed: readNumberField(text, 'moveSpeed'),
    maxAttackRange: readNumberField(text, 'maxAttackRange'),
    shootDelay: readTimeAsSeconds(text, 'shootDelay'),
    directDamage: readNumberField(text, 'directDamage'),
    areaDamage: readNumberField(text, 'areaDamage'),
    sections,
    resources: extractResourceReferences(text),
    copyFroms: extractCopyFroms(text),
  };
}

function extractCopyFromsFromUnit(unit: UnitSummary): string[] {
  return unit.copyFroms;
}

function extractCopyFroms(text: string): string[] {
  const result: string[] = [];
  const re = /^\s*copyFrom\s*[:=]\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    for (const part of stripInlineComment(match[1]).split(',')) {
      const value = part.trim().replace(/^['"]|['"]$/g, '');
      if (value) result.push(value);
    }
  }
  return result;
}

function readField(text: string, key: string): string {
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*[:=]\\s*(.+)$`, 'im');
  const match = text.match(re);
  return match ? stripInlineComment(match[1]).trim().replace(/^['"]|['"]$/g, '') : '';
}

function readNumberField(text: string, key: string): number | undefined {
  const value = readField(text, key);
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function readTimeAsSeconds(text: string, key: string): number | undefined {
  const value = readField(text, key);
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
  return /s\b/i.test(value) ? num : num / 60;
}

function readPrice(text: string): number | undefined {
  const value = readField(text, 'price');
  if (!value) return undefined;
  const credits = value.match(/credits\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (credits) return Number(credits[1]);
  const first = value.match(/-?\d+(?:\.\d+)?/);
  return first ? Number(first[0]) : undefined;
}

function extractResourceReferences(text: string): string[] {
  const refs: string[] = [];
  const re = /^\s*([^:=#;]+?)\s*[:=]\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const key = match[1].trim().toLowerCase();
    if (!key.includes('image') && !key.includes('icon') && !key.includes('sound')) continue;
    const value = stripInlineComment(match[2]);
    for (const token of value.match(/(?:ROOT:)?[^\s,;#'"]+\.(?:png|ogg|wav)/gi) || []) {
      refs.push(token.replace(/^ROOT:/i, '').replace(/^CUSTOM:/i, '').replace(/^SHARED:/i, ''));
    }
  }
  return refs;
}

function replaceNumericField(text: string, field: string, transform: (current: number) => number): string {
  const re = new RegExp(`^(\\s*${escapeRegExp(field)}\\s*[:=]\\s*)(-?\\d+(?:\\.\\d+)?)(.*)$`, 'im');
  return text.replace(re, (_m, prefix, raw, suffix) => {
    const next = transform(Number(raw));
    const rounded = Number.isInteger(next) ? String(next) : next.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return `${prefix}${rounded}${suffix}`;
  });
}

function replaceSymbolSafely(text: string, oldName: string, newName: string): string {
  return text.split(/(\r?\n)/).map(part => {
    if (part === '\n' || part === '\r\n') {
      return part;
    }

    const trimmed = part.trimStart();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      return part;
    }

    const commentIndex = part.search(/\s[;#]/);
    const code = commentIndex >= 0 ? part.slice(0, commentIndex) : part;
    const comment = commentIndex >= 0 ? part.slice(commentIndex) : '';
    return replaceBoundedToken(code, oldName, newName) + comment;
  }).join('');
}

function replaceBoundedToken(text: string, oldName: string, newName: string): string {
  const re = new RegExp(escapeRegExp(oldName), 'g');
  return text.replace(re, (match, offset: number, source: string) => {
    const before = offset > 0 ? source[offset - 1] : '';
    const after = source[offset + match.length] || '';
    return isSymbolBoundary(before) && isSymbolBoundary(after) ? newName : match;
  });
}

function isSymbolBoundary(ch: string): boolean {
  return !ch || !/[A-Za-z0-9_.$-]/.test(ch);
}

function estimateCombat(attacker: UnitSummary, defender: UnitSummary): { dps: number; ttk: number } {
  const damage = Math.max(attacker.directDamage || 0, attacker.areaDamage || 0, 1);
  const delay = attacker.shootDelay && attacker.shootDelay > 0 ? attacker.shootDelay : 1;
  const dps = damage / delay;
  const hp = defender.maxHp || 1;
  return { dps, ttk: hp / dps };
}

function getBuiltinTemplates(): Record<string, string> {
  return {
    '基础陆军单位': [
      '[core]',
      'name: ${1:land_unit}',
      'displayText: ${2:Land Unit}',
      'class: CustomUnitMetadata',
      'price: ${3:700}',
      'maxHp: ${4:500}',
      'mass: 500',
      'techLevel: 1',
      'buildSpeed: 0.0015',
      'radius: 12',
      '',
      '[graphics]',
      'total_frames: 1',
      'image: ${5:unit.png}',
      'image_shadow: AUTO',
      '',
      '[attack]',
      'canAttack: true',
      'canAttackFlyingUnits: false',
      'canAttackLandUnits: true',
      'maxAttackRange: 130',
      'shootDelay: 60',
      '',
      '[turret_1]',
      'x: 0',
      'y: 0',
      'projectile: 1',
      '',
      '[projectile_1]',
      'directDamage: 25',
      'life: 70',
      'speed: 6',
      '',
      '[movement]',
      'movementType: LAND',
      'moveSpeed: 1.0',
    ].join('\n'),
    '生产建筑': [
      '[core]',
      'name: ${1:factory}',
      'displayText: ${2:Factory}',
      'class: CustomUnitMetadata',
      'price: ${3:1200}',
      'maxHp: ${4:1000}',
      'mass: 9000',
      'radius: 20',
      'isBuilding: true',
      'buildSpeed: 0.001',
      '',
      '[graphics]',
      'image: ${5:factory.png}',
      'image_shadow: AUTO',
      '',
      '[canBuild_1]',
      'name: ${6:tank}',
      'pos: 0.1',
      '',
      '[movement]',
      'movementType: NONE',
      'moveSpeed: 0',
    ].join('\n'),
    '炮塔和弹道': [
      '[turret_${1:main}]',
      'x: ${2:0}',
      'y: ${3:0}',
      'projectile: ${4:main}',
      'turnSpeed: 3',
      'shoot_sound: plasma_fire',
      '',
      '[projectile_${4:main}]',
      'directDamage: ${5:40}',
      'life: 70',
      'speed: 6',
    ].join('\n'),
  };
}

function findNearestSectionName(document: vscode.TextDocument, line: number): string {
  for (let i = line; i >= 0; i--) {
    const match = document.lineAt(i).text.match(/^\s*\[([^\]]+)\]\s*$/);
    if (match) return match[1].trim();
  }
  return '';
}

async function showMarkdownReport(title: string, content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });
  vscode.window.showInformationMessage(`${title} 已生成`);
}

async function inputNumber(prompt: string, value: string): Promise<string> {
  const result = await vscode.window.showInputBox({
    prompt,
    value,
    validateInput: v => Number.isFinite(Number(v)) ? null : '请输入数字',
  });
  return result || value;
}

function getWorkspaceRelativePath(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? toForwardSlash(path.relative(folder.uri.fsPath, uri.fsPath)) : path.basename(uri.fsPath);
}

function fullRange(text: string): vscode.Range {
  const lines = text.split(/\r?\n/);
  return new vscode.Range(0, 0, lines.length - 1, lines[lines.length - 1].length);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = map.get(k) || [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

function tableOrEmpty<T>(items: T[], header: string, separator: string, row: (item: T) => string): string[] {
  if (items.length === 0) return ['无'];
  return [header, separator, ...items.map(row)];
}

function stripInlineComment(value: string): string {
  const commentIndex = value.search(/\s[;#]/);
  return commentIndex >= 0 ? value.slice(0, commentIndex) : value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeMd(value: string | undefined): string {
  return String(value || '').replace(/\|/g, '\\|');
}

function fmt(value: unknown): string {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

function normalizePath(value: string): string {
  return toForwardSlash(value).toLowerCase().replace(/^root:/, '');
}

function toForwardSlash(value: string): string {
  return value.replace(/\\/g, '/');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return '未知';
  return `${seconds.toFixed(1)} 秒`;
}

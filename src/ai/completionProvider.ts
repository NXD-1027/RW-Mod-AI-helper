/**
 * 铁锈战争 INI 智能补全
 *
 * 逐步实现计划：
 * 第一步 ✨ 段落名补全 + [core] 字段名补全（当前）
 * 第二步 ➕ 值补全（布尔/枚举/类型提示）
 * 第三步 ➕ 其他 17 个段落的字段与值
 */

import * as vscode from 'vscode';
import { loadSectionFields, extractExampleValue, loadValues } from './dataLoader';
import { t } from '../i18n';

// ─── 类型定义 ───

interface FieldDef {
  label: string;
  /** 字段说明文字 */
  detail: string;
  /** 值类型，用于冒号后值补全 */
  valueType?: string;
  /** 示例值（如 "200"），补全时自动填入冒号后 */
  example?: string;
}

interface SectionDef {
  name: string;
  detail: string;
  /** 是否允许多个实例（带 _NAME 后缀） */
  isMulti: boolean;
  fields: FieldDef[];
}

// ─── 段落数据 ───
// 第一步：只放 [core]，效果验证 OK 后逐步追加其余段落

export const SECTIONS: SectionDef[] = [
  {
    name: 'core',
    detail: '核心属性',
    isMulti: false,
    fields: [], // 从 data/sections/core.json 懒加载
  },
  // 段落名补全时也会展示以下段落名，但字段数据后续追加
  { name: 'graphics', detail: '外观属性', isMulti: false, fields: [] },
  { name: 'attack', detail: '攻击属性', isMulti: false, fields: [] },
  { name: 'movement', detail: '移动属性', isMulti: false, fields: [] },
  { name: 'ai', detail: 'AI行为', isMulti: false, fields: [] },
  { name: 'canBuild', detail: '建造队列', isMulti: true, fields: [] },
  { name: 'turret', detail: '炮塔', isMulti: true, fields: [] },
  { name: 'projectile', detail: '弹道', isMulti: true, fields: [] },
  { name: 'action', detail: '动作（UI可见）', isMulti: true, fields: [] },
  { name: 'hiddenAction', detail: '隐藏动作', isMulti: true, fields: [] },
  { name: 'effect', detail: '视觉特效', isMulti: true, fields: [] },
  { name: 'animation', detail: '动画定义', isMulti: true, fields: [] },
  { name: 'leg', detail: '腿（可移动装饰）', isMulti: true, fields: [] },
  { name: 'arm', detail: '手臂', isMulti: true, fields: [] },
  { name: 'attachment', detail: '附着点', isMulti: true, fields: [] },
  { name: 'placementRule', detail: '放置规则', isMulti: true, fields: [] },
  { name: 'resource', detail: '本地资源', isMulti: true, fields: [] },
  { name: 'template', detail: '模板', isMulti: true, fields: [] },
  { name: 'decal', detail: '贴花/2.5D精灵', isMulti: true, fields: [] },
  { name: 'comment', detail: '注释段落', isMulti: true, fields: [] },
  { name: 'global_resource', detail: '全局资源', isMulti: true, fields: [] },
];

// ─── 快速查找索引（懒加载） ───

/** 段落名 → 字段列表 */
const SECTION_FIELD_MAP = new Map<string, FieldDef[]>();

for (const sec of SECTIONS) {
  SECTION_FIELD_MAP.set(sec.name, []);
  if (sec.isMulti) {
    SECTION_FIELD_MAP.set(sec.name + '_NAME', []);
  }
}

/**
 * 获取段落的字段列表（从 JSON 懒加载）
 */
export function getSectionFields(sectionName: string): FieldDef[] {
  const stored = SECTION_FIELD_MAP.get(sectionName);
  if (stored && stored.length > 0) return stored;

  // 别名映射：hiddenAction → action, arm → leg
  const aliasMap: Record<string, string> = {
    hiddenaction: 'action',
    hiddenAction: 'action',
    hiddenAction_NAME: 'action',
    arm: 'leg',
    arm_NAME: 'leg',
  };
  const actualName = aliasMap[sectionName] || sectionName;

  const raw = loadSectionFields(actualName);
  if (raw.length > 0) {
    const fields: FieldDef[] = raw.map(f => ({
      label: f.name,
      detail: f.description,
      valueType: f.type || undefined,
      example: extractExampleValue(f.example),
    }));
    SECTION_FIELD_MAP.set(sectionName, fields);
    return fields;
  }

  return [];
}

// ─── 段落索引缓存（二分查找加速） ───

interface SectionInfo {
  name: string;
  /** 起始行号 */
  line: number;
  /** 结束行号（下一个段落的前一行，或文件末尾） */
  endLine: number;
}

/** 文档 URI → 段落索引列表 */
const sectionIndexCache = new Map<string, { version: number; sections: SectionInfo[] }>();

/**
 * 构建文档的段落索引（预扫描一遍，后续二分查找）
 */
function buildSectionIndex(document: vscode.TextDocument): SectionInfo[] {
  const key = document.uri.toString();
  const cached = sectionIndexCache.get(key);
  if (cached && cached.version === document.version) {
    // LRU：重新放入 Map 末尾，避免被淘汰
    sectionIndexCache.delete(key);
    sectionIndexCache.set(key, cached);
    return cached.sections;
  }

  const sections: SectionInfo[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    const m = line.match(/^\[([^\]]+)\]\s*$/);
    if (m) {
      // 给前一个段落标记结束行
      if (sections.length > 0) {
        sections[sections.length - 1].endLine = i - 1;
      }
      sections.push({
        name: m[1].trim(),
        line: i,
        endLine: document.lineCount - 1,
      });
    }
  }

  // 限制缓存大小
  if (sectionIndexCache.size >= 50) {
    const firstKey = sectionIndexCache.keys().next().value;
    if (firstKey) sectionIndexCache.delete(firstKey);
  }
  sectionIndexCache.set(key, { version: document.version, sections });
  return sections;
}

/**
 * 二分查找：光标所在行属于哪个段落
 */
export function findSectionAtLine(document: vscode.TextDocument, line: number): string | undefined {
  const sections = buildSectionIndex(document);
  if (sections.length === 0) return undefined;

  let left = 0;
  let right = sections.length - 1;
  let result: SectionInfo | undefined;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (sections[mid].line <= line) {
      result = sections[mid];
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (!result) return undefined;
  // 多实例段落（如 turret_1 → turret）
  const name = result.name.toLowerCase();
  for (const sec of SECTIONS) {
    if (sec.isMulti) {
      const prefix = sec.name + '_';
      if (name === sec.name || name.startsWith(prefix)) {
        return sec.name;
      }
    }
  }
  return name;
}

// ─── Provider 实现 ───

export class RwCompletionProvider implements vscode.CompletionItemProvider {

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    const line = document.lineAt(position).text;
    const cursor = position.character;
    const before = line.substring(0, cursor);

    // 场景1：在 [ ] 内 → 段落名补全
    if (this.inBrackets(before)) {
      return this.sectionCompletions();
    }

    // 场景2：冒号后 → 值补全
    const colon = line.indexOf(':');
    if (colon >= 0 && cursor > colon + 1) {
      const currentSection = this.detectSection(document, position);
      return this.valueCompletions(line, currentSection);
    }

    // 场景3：字段名补全（感知当前段落 + 重复检测）
    const currentSection = this.detectSection(document, position);
    const existingKeys = this.collectExistingKeys(document, position, currentSection);
    return this.fieldCompletions(currentSection, existingKeys);
  }

  /**
   * 判断光标是否在 [ ] 内（有 [ 且后面没有 ]）
   */
  private inBrackets(before: string): boolean {
    const o = before.lastIndexOf('[');
    const c = before.lastIndexOf(']');
    return o >= 0 && c < o;
  }

  /**
   * 从当前行往前扫描，找到最近的 [section]（使用缓存 + 二分查找）
   */
  private detectSection(document: vscode.TextDocument, position: vscode.Position): string | undefined {
    return findSectionAtLine(document, position.line);
  }

  /**
   * 收集当前段落中已存在的字段键名（只扫描本段落范围）
   */
  private collectExistingKeys(document: vscode.TextDocument, position: vscode.Position, currentSection: string | undefined): Set<string> {
    const keys = new Set<string>();
    if (!currentSection) return keys;

    // 从段落索引获取当前段落的起止行
    const sections = buildSectionIndex(document);
    let sectionStart = 0;
    let sectionEnd = position.line; // 只扫描到当前行
    for (const sec of sections) {
      const secName = sec.name.toLowerCase();
      // 匹配段落名（含多实例）
      let matched = false;
      if (secName === currentSection) {
        matched = true;
      } else {
        for (const s of SECTIONS) {
          if (s.isMulti && s.name === currentSection && secName.startsWith(s.name + '_')) {
            matched = true;
            break;
          }
        }
      }
      if (matched) {
        sectionStart = sec.line;
        sectionEnd = Math.min(sec.endLine, position.line);
        break;
      }
    }

    for (let i = sectionStart; i <= sectionEnd; i++) {
      const lineText = document.lineAt(i).text.trim();
      // 跳过段落行本身
      if (lineText.startsWith('[') && lineText.endsWith(']')) continue;
      const colonIdx = lineText.indexOf(':');
      if (colonIdx >= 0) {
        const key = lineText.substring(0, colonIdx).trim().toLowerCase();
        if (key) keys.add(key);
      }
    }

    return keys;
  }

  // ─── 1. 段落名补全 ───

  private sectionCompletions(): vscode.CompletionItem[] {
    return SECTIONS.map(sec => {
      const label = sec.isMulti ? `${sec.name}_NAME` : sec.name;
      const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Struct);
      item.detail = sec.detail;
      if (sec.isMulti) {
        // 多实例：填入 "turret_" 让用户输入名称
        item.insertText = new vscode.SnippetString(`${sec.name}_$0`);
      } else {
        // 单实例：填入段落名，然后光标右移跳过 VS Code 自动补的 ]
        item.insertText = sec.name;
        item.command = {
          command: 'rwMod.cursorRight',
          title: '跳过]',
        };
      }
      return item;
    });
  }

  // ─── 2. 值补全（冒号后，根据字段 valueType 提示可选值） ───

  private valueCompletions(line: string, currentSection: string | undefined): vscode.CompletionItem[] {
    const colon = line.indexOf(':');
    const key = line.substring(0, colon).trim().toLowerCase();
    if (!key || !currentSection) return [];

    // 从 JSON 懒加载字段定义
    const fields = getSectionFields(currentSection);
    if (!fields || fields.length === 0) return [];

    // 标准化键名，匹配字段 label
    const normalizedKey = key.replace(/[_\s]/g, '');
    const field = fields.find(f => f.label.replace(/[_\s]/g, '').toLowerCase() === normalizedKey);
    if (!field || !field.valueType) return [];

    // 按类型加载枚举值（从 data/value/<type>.json）
    const values = loadValues(field.valueType);
    if (values.length > 0) {
      return values.map(v => new vscode.CompletionItem(v.name, vscode.CompletionItemKind.EnumMember));
    }

    // 没有专门的枚举值文件 → 返回空（后续可加类型提示）
    return [];
  }

  // ─── 3. 字段名补全（按段落过滤 + 重复标注 + 示例值） ───

  private fieldCompletions(section: string | undefined, existingKeys: Set<string>): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    const added = new Set<string>();

    if (section) {
      const fields = getSectionFields(section);
      for (const f of fields) {
        if (added.has(f.label)) continue;
        added.add(f.label);

        const item = new vscode.CompletionItem(f.label, vscode.CompletionItemKind.Property);
        // 有示例值则填入 defaultValue，否则只加冒号
        if (f.example) {
          item.insertText = new vscode.SnippetString(`${f.label}: \${1:${f.example}}`);
        } else {
          item.insertText = new vscode.SnippetString(`${f.label}: $0`);
        }

        // 详细文档（类型、描述、示例）
        const docs = new vscode.MarkdownString();
        docs.appendMarkdown(`**${f.label}**  \n`);
        if (f.valueType) {
          docs.appendMarkdown(`类型: \`${f.valueType}\`  \n`);
        }
        docs.appendMarkdown(`描述: ${f.detail}  \n`);
        if (f.example) {
          docs.appendMarkdown(`\n示例:\n\`\`\`ini\n${f.label}: ${f.example}\n\`\`\``);
        }
        item.documentation = docs;

        const key = f.label.toLowerCase();

        // 标注重复字段
        if (existingKeys.has(key)) {
          item.detail = t('alreadyHasField', section || '', f.detail);
          item.sortText = 'z' + f.label;
        } else {
          item.detail = `[${section}] ${f.detail}`;
          item.sortText = 'a' + f.label;
        }

        items.push(item);
      }
    }

    return items;
  }
}

// ─── 导出：重复字段检测（红色波浪线 + 黄色底） ───

export interface DuplicateScanResult {
  /** 重复项的诊断（红色波浪线，用在第二/三...次出现的位置） */
  diagnostics: vscode.Diagnostic[];
  /** 首次出现位置的范围（用于黄色背景高亮） */
  firstOccurrenceRanges: vscode.Range[];
}

/**
 * 扫描文档，找出各段落中重复的字段键
 * 返回诊断信息 + 首次出现位置范围
 */
export function scanDuplicates(document: vscode.TextDocument): DuplicateScanResult | null {
  if (document.languageId !== 'rusted-warfare' && document.languageId !== 'ini') {
    return null;
  }

  // 允许重复的字段（多行各有不同含义）
  const ALLOW_DUPLICATE_FIELDS = new Set([
    'defineunitmemory',
    '@memory',
    'copyfrom',
    'soundonattackorder',
    'soundonmoveorder',
    'soundonnewselection',
    'spawneffects',
    'spawnunit',
    'addresources',
    'altnames',
    'tags',
  ]);

  const diagnostics: vscode.Diagnostic[] = [];
  const firstOccurrenceRanges: vscode.Range[] = [];

  // 段落 → 键名 → 出现行号列表
  const sectionKeys: Map<string, Map<string, number[]>> = new Map();
  let currentSection = '';

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();

    // 检测段落
    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    // 跳过不在段落内的行
    if (!currentSection) continue;

    // 检测 key: value
    const colonIdx = line.indexOf(':');
    if (colonIdx >= 0) {
      const key = line.substring(0, colonIdx).trim().toLowerCase();
      // 跳过 @memory 等模板指令（用空格分割而非:分割）
      if (key.startsWith('@memory')) continue;
      if (ALLOW_DUPLICATE_FIELDS.has(key)) continue;
      if (key && !key.includes(' ')) {
        if (!sectionKeys.has(currentSection)) {
          sectionKeys.set(currentSection, new Map());
        }
        const keyMap = sectionKeys.get(currentSection)!;
        if (!keyMap.has(key)) {
          keyMap.set(key, []);
        }
        keyMap.get(key)!.push(i);
      }
    }
  }

  // 处理每个段落的重复键
  for (const [_section, keyMap] of sectionKeys) {
    for (const [key, lines] of keyMap) {
      if (lines.length <= 1) continue;

      // 首次出现 → 黄色背景
      const firstLine = lines[0];
      const firstLineText = document.lineAt(firstLine).text;
      const firstColon = firstLineText.indexOf(':');
      const firstKeyEnd = firstColon >= 0 ? firstColon : firstLineText.length;
      firstOccurrenceRanges.push(
        new vscode.Range(
          new vscode.Position(firstLine, 0),
          new vscode.Position(firstLine, firstKeyEnd)
        )
      );

      // 后续重复 → 红色波浪线
      for (let j = 1; j < lines.length; j++) {
        const lineNum = lines[j];
        const lineText = document.lineAt(lineNum).text;
        const colonIdx = lineText.indexOf(':');
        const keyEnd = colonIdx >= 0 ? colonIdx : lineText.length;

        const range = new vscode.Range(
          new vscode.Position(lineNum, 0),
          new vscode.Position(lineNum, keyEnd)
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          t('duplicateField', key, String(firstLine + 1)),
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
      }
    }
  }

  return { diagnostics, firstOccurrenceRanges };
}

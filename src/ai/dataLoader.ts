import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface FieldData {
  name: string;
  type: string;
  description: string;
  example: string;
}

export interface ValueData {
  name: string;
  description: string;
}

interface SectionDataFile {
  name: string;
  description: string;
  data: FieldData[];
}

interface ValueDataFile {
  name: string;
  data: ValueData[];
}

// 内存缓存
const sectionCache = new Map<string, FieldData[]>();
const valueCache = new Map<string, ValueData[]>();

/** 检测 VS Code 当前 UI 语言是否使用中文 */
function isChineseLanguage(): boolean {
  const lang = vscode.env.language;
  return lang === 'zh-cn' || lang === 'zh-tw' || lang === 'zh';
}

/**
 * 获取数据目录路径，根据 VS Code 语言自动切换
 * 中文 → data/sections/  data/value/
 * 英文 → data/sections_en/  data/value_en/
 */
function dataDir(kind: 'sections' | 'value', ...parts: string[]): string {
  const subDir = isChineseLanguage() ? kind : `${kind}_en`;
  return path.join(__dirname, '..', '..', 'data', subDir, ...parts);
}

/**
 * 从 data/sections/<name>.json 或 data/sections_en/<name>.json 加载字段列表
 * 根据 VS Code 语言自动选择
 */
export function loadSectionFields(sectionName: string): FieldData[] {
  const cached = sectionCache.get(sectionName);
  if (cached) return cached;

  try {
    const filePath = dataDir('sections', `${sectionName}.json`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: SectionDataFile = JSON.parse(raw);
    const fields = parsed.data || [];
    sectionCache.set(sectionName, fields);
    return fields;
  } catch {
    return [];
  }
}

/**
 * 从 data/value/<type>.json 或 data/value_en/<type>.json 加载枚举值列表
 * 根据 VS Code 语言自动选择
 */
export function loadValues(type: string): ValueData[] {
  const cached = valueCache.get(type);
  if (cached) return cached;

  try {
    const filePath = dataDir('value', `${type}.json`);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: ValueDataFile = JSON.parse(raw);
    const values = parsed.data || [];
    valueCache.set(type, values);
    return values;
  } catch {
    return [];
  }
}

/**
 * 清空缓存（语言切换时调用）
 */
export function clearDataCache(): void {
  sectionCache.clear();
  valueCache.clear();
}

/**
 * 从 example 字符串（如 "maxHp: 200"）提取值部分
 */
export function extractExampleValue(example: string): string {
  const colon = example.indexOf(':');
  return colon >= 0 ? example.substring(colon + 1).trim() : '';
}

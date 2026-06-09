import * as vscode from 'vscode';
import { t } from '../i18n';

const DIAGNOSTIC_SOURCE = 'rwMod-memory';

/**
 * 诊断未使用的 @memory 变量
 * 扫描当前文件内定义的 memory 变量，检查是否有被引用
 */
export class MemoryDiagnosticProvider {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  dispose(): void {
    this.collection.dispose();
  }

  refresh(document: vscode.TextDocument): void {
    if (document.languageId !== 'rusted-warfare' && document.languageId !== 'ini') {
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics = analyzeMemoryVariables(document);
    this.collection.set(document.uri, diagnostics);
  }
}

// ── 分析逻辑 ──

interface MemoryDef {
  name: string;
  line: number;
}

/**
 * 分析文档中的 memory 变量定义和引用
 * 返回未使用变量的诊断
 */
function analyzeMemoryVariables(document: vscode.TextDocument): vscode.Diagnostic[] {
  const defs = findDefinitions(document);
  if (defs.length === 0) return [];

  const refs = findReferences(document);

  const diagnostics: vscode.Diagnostic[] = [];
  for (const def of defs) {
    if (refs.has(def.name)) continue;

    const range = new vscode.Range(def.line, 0, def.line, document.lineAt(def.line).text.length);
    diagnostics.push(new vscode.Diagnostic(
      range,
      t('unusedMemoryVar', def.name),
      vscode.DiagnosticSeverity.Warning,
    ));
  }

  return diagnostics;
}

/**
 * 查找所有 memory 变量定义
 * 支持两种语法：
 *   1. @memory varName: type           (template 语法)
 *   2. defineUnitMemory: varName type   ([core] 字段语法)
 */
function findDefinitions(document: vscode.TextDocument): MemoryDef[] {
  const defs: MemoryDef[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;
    const trimmed = line.trim();

    // @memory varName: type
    const atMatch = trimmed.match(/^@memory\s+(\w+)/);
    if (atMatch) {
      const name = atMatch[1];
      if (!seen.has(name)) {
        seen.add(name);
        defs.push({ name, line: i });
      }
      continue;
    }

    // defineUnitMemory: varName type
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      if (key === 'defineunitmemory') {
        const valuePart = trimmed.slice(colonIdx + 1).trim();
        const nameMatch = valuePart.match(/^(\w+)/);
        if (nameMatch) {
          const name = nameMatch[1];
          if (!seen.has(name)) {
            seen.add(name);
            defs.push({ name, line: i });
          }
        }
      }
    }
  }

  return defs;
}

/**
 * 查找所有对 memory 变量的引用
 * 引用方式：
 *   1. memory.xxx  —— 在 action/condition 中读取
 *   2. setUnitMemory: xxx  —— 写入
 *   3. updateUnitMemory: xxx  —— 更新
 */
function findReferences(document: vscode.TextDocument): Set<string> {
  const refs = new Set<string>();

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    // memory.xxx 引用
    const memRefRe = /\bmemory\.(\w+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = memRefRe.exec(line)) !== null) {
      refs.add(match[1]);
    }

    // setUnitMemory: xxx 和 updateUnitMemory: xxx
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      if (key === 'setunitmemory' || key === 'updateunitmemory') {
        const valuePart = line.slice(colonIdx + 1).trim();
        const nameMatch = valuePart.match(/^(\w+)/);
        if (nameMatch) {
          refs.add(nameMatch[1]);
        }
      }
    }
  }

  return refs;
}

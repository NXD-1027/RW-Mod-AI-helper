import * as vscode from 'vscode';
import { t } from '../i18n';

/**
 * 扫描文档提取 @memory 变量定义
 */
function scanMemoryVars(document: vscode.TextDocument): string[] {
  const vars: string[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text.trim();
    const m = line.match(/^@memory\s+(\w+)/);
    if (m) {
      vars.push(m[1]);
    }
  }
  return vars;
}

/**
 * 判断光标所在字段是否接受内存变量
 */
function isMemoryField(line: string): boolean {
  const colon = line.indexOf(':');
  if (colon < 0) return false;
  const key = line.substring(0, colon).trim().toLowerCase();
  return key === 'setunitmemory' ||
         key === 'updateunitmemory' ||
         key === 'defineunitmemory';
}

/**
 * 记忆变量补全
 * - 在 [template] 下提示 @memory 等模板指令
 * - 在 setUnitMemory: 等字段后提示已定义的变量
 * - 在 memory. 后提示变量名
 */
export class MemoryCompletionProvider implements vscode.CompletionItemProvider {

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    const line = document.lineAt(position).text;
    const cursor = position.character;
    const before = line.substring(0, cursor);
    const colon = line.indexOf(':');

    // 场景1：在 [template] 下输入 @ → 提示模板指令
    if (before.startsWith('@') && !before.includes(':')) {
      return [
        this.item('@memory', t('defineMemoryVar'), t('memoryVarUsage')),
        this.item('@define', t('defineLocalVar'), t('localVarUsage')),
        this.item('@global', t('defineGlobalVar'), t('globalVarUsage')),
      ];
    }

    // 场景2：在 memory. 后面 → 提示已定义的变量名
    if (before.match(/\bmemory\.\w*$/)) {
      return scanMemoryVars(document).map(v =>
        this.item(v, 'memory variable', ''),
      );
    }

    // 场景3：在 setUnitMemory: 后面 → 提示可用变量
    if (isMemoryField(line) && colon >= 0 && cursor > colon + 1) {
      // 继续输入变量名
      return scanMemoryVars(document).map(v =>
        this.item(v, 'memory variable', t('memoryVarTemplate', v)),
      );
    }

    return [];
  }

  private item(name: string, detail: string, docs: string): vscode.CompletionItem {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
    item.detail = detail;
    if (docs) {
      item.documentation = new vscode.MarkdownString(docs);
    }
    // 字段值场景：填入 "变量名 = "
    if (name.startsWith('@')) {
      item.insertText = new vscode.SnippetString(`${name} \${1:变量名}: \${2:类型}`);
    }
    return item;
  }
}

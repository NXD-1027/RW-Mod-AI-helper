import * as vscode from 'vscode';

/**
 * 大纲视图 — 左侧文件结构中显示 [section] 段落和内部字段
 */
export class IniOutlineProvider implements vscode.DocumentSymbolProvider {

  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    let curSec: vscode.DocumentSymbol | null = null;
    let secStartLine = 0;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();
      const secMatch = text.match(/^\[([^\]]+)\]\s*$/);

      if (secMatch) {
        // 结束上一段
        if (curSec) {
          const endLine = i - 1;
          const endPos = endLine >= 0 ? document.lineAt(endLine).range.end : line.range.end;
          curSec.range = new vscode.Range(new vscode.Position(secStartLine, 0), endPos);
          symbols.push(curSec);
        }

        // 新段落
        curSec = new vscode.DocumentSymbol(
          secMatch[1], '',
          vscode.SymbolKind.Module,
          line.range,        // 临时范围
          line.range,        // 选中时跳到这行
        );
        curSec.children = [];
        secStartLine = i;
        continue;
      }

      // 段落内的字段
      if (curSec && text.includes(':')) {
        const colon = text.indexOf(':');
        if (colon > 0) {
          const key = text.substring(0, colon).trim();
          const value = text.substring(colon + 1).trim();

          let kind = vscode.SymbolKind.Property;
          if (/^\d+\.?\d*$/.test(value)) kind = vscode.SymbolKind.Number;
          else if (/^(true|false)$/i.test(value)) kind = vscode.SymbolKind.Boolean;
          else if (/^#[0-9a-f]{3,8}/i.test(value)) kind = vscode.SymbolKind.Constant;
          else if (/\.(png|wav|ogg)$/i.test(value)) kind = vscode.SymbolKind.File;

          curSec.children!.push(
            new vscode.DocumentSymbol(key, value, kind, line.range, line.range)
          );
        }
      }
    }

    // 最后一段
    if (curSec) {
      curSec.range = new vscode.Range(
        new vscode.Position(secStartLine, 0),
        document.lineAt(document.lineCount - 1).range.end,
      );
      symbols.push(curSec);
    }

    return symbols;
  }
}

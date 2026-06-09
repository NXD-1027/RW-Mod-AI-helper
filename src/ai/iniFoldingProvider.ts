import * as vscode from 'vscode';

/**
 * INI 代码折叠 — 按 [section] 段落折叠
 */
export class IniFoldingRangeProvider implements vscode.FoldingRangeProvider {

  provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    const ranges: vscode.FoldingRange[] = [];
    let sectionStart = -1;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text.trim();

      if (line.startsWith('[') && line.endsWith(']')) {
        // 前一个段落结束于本行之前
        if (sectionStart !== -1 && i - 1 > sectionStart) {
          ranges.push(new vscode.FoldingRange(sectionStart, i - 1));
        }
        sectionStart = i;
      }
    }

    // 最后一个段落
    if (sectionStart !== -1 && document.lineCount - 1 > sectionStart) {
      ranges.push(new vscode.FoldingRange(sectionStart, document.lineCount - 1));
    }

    return ranges;
  }
}

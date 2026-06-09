import * as vscode from 'vscode';

/**
 * INI 颜色预览 — 识别 #RRGGBB、#RRGGBBAA 格式的颜色值
 * 在编辑器中显示色块，点击可打开调色板选色
 */
export class RwColorProvider implements vscode.DocumentColorProvider {

  /** 查找文档中所有颜色值 */
  provideDocumentColors(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.ColorInformation[] {
    const colors: vscode.ColorInformation[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;

      // 匹配 #RGB、#RGBA、#RRGGBB、#RRGGBBAA
      const colorRegex = /#([0-9a-fA-F]{3,8})\b/g;
      let match: RegExpExecArray | null;

      while ((match = colorRegex.exec(line)) !== null) {
        const hex = match[1];
        const validLengths = [3, 4, 6, 8];
        if (!validLengths.includes(hex.length)) continue;

        let r = 0, g = 0, b = 0, a = 1;

        if (hex.length === 3) {
          // #RGB
          r = parseInt(hex[0] + hex[0], 16) / 255;
          g = parseInt(hex[1] + hex[1], 16) / 255;
          b = parseInt(hex[2] + hex[2], 16) / 255;
        } else if (hex.length === 6) {
          // #RRGGBB
          r = parseInt(hex.substring(0, 2), 16) / 255;
          g = parseInt(hex.substring(2, 4), 16) / 255;
          b = parseInt(hex.substring(4, 6), 16) / 255;
        } else if (hex.length === 8) {
          // #RRGGBBAA
          r = parseInt(hex.substring(0, 2), 16) / 255;
          g = parseInt(hex.substring(2, 4), 16) / 255;
          b = parseInt(hex.substring(4, 6), 16) / 255;
          a = parseInt(hex.substring(6, 8), 16) / 255;
        } else if (hex.length === 4) {
          // #RGBA
          r = parseInt(hex[0] + hex[0], 16) / 255;
          g = parseInt(hex[1] + hex[1], 16) / 255;
          b = parseInt(hex[2] + hex[2], 16) / 255;
          a = parseInt(hex[3] + hex[3], 16) / 255;
        }

        const startPos = document.positionAt(document.offsetAt(new vscode.Position(i, 0)) + (match.index));
        const endPos = document.positionAt(document.offsetAt(startPos) + match[0].length);
        const range = new vscode.Range(startPos, endPos);

        colors.push(new vscode.ColorInformation(
          range,
          new vscode.Color(r, g, b, a)
        ));
      }
    }

    return colors;
  }

  /** 颜色选择器确认后，把颜色写回文档 */
  provideColorPresentations(
    color: vscode.Color,
    _context: { document: vscode.TextDocument; range: vscode.Range },
    _token: vscode.CancellationToken,
  ): vscode.ColorPresentation[] {
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
    const r = toHex(color.red);
    const g = toHex(color.green);
    const b = toHex(color.blue);

    if (color.alpha < 1) {
      const a = toHex(color.alpha);
      return [new vscode.ColorPresentation(`#${r}${g}${b}${a}`)];
    }
    return [new vscode.ColorPresentation(`#${r}${g}${b}`)];
  }
}

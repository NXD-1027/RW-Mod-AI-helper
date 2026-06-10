import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { loadValues } from './dataLoader';
import { getSectionFields, findSectionAtLine, SECTIONS } from './completionProvider';
import { t } from '../i18n';

/**
 * 铁锈战争 INI 悬停提示
 * 鼠标悬停时显示字段文档、图片预览
 */
export class RwHoverProvider implements vscode.HoverProvider {

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    const cursor = position.character;

    // 情况0：悬停在图片路径上 → 图片预览
    const imageResult = this.hoverOnImage(line, cursor, document);
    if (imageResult) return imageResult;

    // 情况1：悬停在 [section] 上
    const sectionResult = this.hoverOnSection(line, cursor);
    if (sectionResult) return sectionResult;

    // 情况2：悬停在字段值上（冒号后）
    const valueResult = this.hoverOnValue(line, cursor, document, position);
    if (valueResult) return valueResult;

    // 情况3：悬停在字段名上（冒号前）
    const fieldResult = this.hoverOnField(line, cursor, document, position);
    if (fieldResult) return fieldResult;

    return null;
  }

  /**
   * 图片预览：行内有 `image:` 或包含图片后缀时显示缩略图
   */
  private hoverOnImage(line: string, cursor: number, document: vscode.TextDocument): vscode.Hover | null {
    const colon = line.indexOf(':');
    if (colon < 0) return null;

    const key = line.substring(0, colon).trim().toLowerCase();
    const value = line.substring(colon + 1).trim();

    // 只处理含 "image"/"icon" 的键名或直接图片路径
    const isImageKey = key.includes('image') || key.includes('icon');
    const isImageExt = /\.(png)$/i.test(value);
    if (!isImageKey && !isImageExt) return null;

    // 检查光标是否在值区域
    if (cursor <= colon) return null;

    // 尝试解析图片路径
    const absPath = this.resolveImagePath(value, document);
    if (!absPath) {
      // 能识别但找不到文件 → 给提示
      const md = new vscode.MarkdownString();
      md.appendMarkdown(t('imageNotFound', value));
      return new vscode.Hover(md);
    }
    if (!fs.existsSync(absPath)) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`🔍 检测到图片路径: \`${value}\`\n\n`);
      md.appendMarkdown(`尝试查找: \`${absPath}\`\n\n文件不存在。请把图片放到 INI 文件旁边试试。`);
      return new vscode.Hover(md);
    }

    const uri = vscode.Uri.file(absPath);
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`${path.basename(absPath)}  \n`);
    md.appendMarkdown(`![](${uri.toString()})`);
    md.isTrusted = true;
    return new vscode.Hover(md);
  }

  /**
   * 解析图片路径：先相对文件目录，再相对工作区根目录
   */
  private resolveImagePath(imageValue: string, document: vscode.TextDocument): string | null {
    // 去掉 CUSTOM: 前缀等
    let clean = imageValue.replace(/^CUSTOM:/i, '').trim();
    // 去掉引号
    clean = clean.replace(/^["']|["']$/g, '');
    if (!clean) return null;

    // 1. 相对文件所在目录
    const docDir = path.dirname(document.uri.fsPath);
    const relativeToFile = path.join(docDir, clean);
    if (fs.existsSync(relativeToFile)) return relativeToFile;

    // 2. 如果工作区有根目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const relativeToWorkspace = path.join(folder.uri.fsPath, clean);
        if (fs.existsSync(relativeToWorkspace)) return relativeToWorkspace;
      }
    }

    return null;
  }

  /**
   * 悬停在 [section] 上
   */
  private hoverOnSection(line: string, cursor: number): vscode.Hover | null {
    const openB = line.indexOf('[');
    const closeB = line.indexOf(']');
    if (openB >= 0 && closeB > openB && cursor > openB && cursor < closeB) {
      const name = line.substring(openB + 1, closeB).trim().toLowerCase();
      // 尝试找段落描述
      for (const sec of SECTIONS) {
        if (sec.name === name) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**${sec.name}** — ${sec.detail}`);
          return new vscode.Hover(md);
        }
      }
    }
    return null;
  }

  /**
   * 悬停在字段值上（冒号后）
   */
  private hoverOnValue(line: string, cursor: number, document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const colon = line.indexOf(':');
    if (colon < 0 || cursor <= colon) return null;

    // 查找该字段的定义
    const key = line.substring(0, colon).trim().toLowerCase();
    const section = findSectionAtLine(document, position.line);
    if (!section) return null;

    const fields = getSectionFields(section);
    const normalizedKey = key.replace(/[_\s]/g, '');
    const field = fields.find(f => f.label.replace(/[_\s]/g, '').toLowerCase() === normalizedKey);
    if (!field || !field.valueType) return null;

    // 如果是枚举类型，显示该值的说明
    const values = loadValues(field.valueType);
    if (values.length > 0) {
      const valueText = line.substring(colon + 1).trim();
      const matchedValue = values.find(v => v.name.toLowerCase() === valueText.toLowerCase());
      if (matchedValue) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${matchedValue.name}**\n\n`);
        md.appendMarkdown(`${matchedValue.description}`);
        return new vscode.Hover(md);
      }
    }

    return null;
  }

  /**
   * 悬停在字段名上（冒号前）
   */
  private hoverOnField(line: string, cursor: number, document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const colon = line.indexOf(':');
    if (colon >= 0 && cursor >= colon) return null;

    // 提取光标处的单词（以空格或 : 为边界）
    const wordStart = cursor > 0 ? Math.max(
      line.lastIndexOf(' ', cursor - 1),
      line.lastIndexOf(':', cursor - 1)
    ) + 1 : 0;
    const wordEndSearch = line.indexOf(' ', cursor);
    const wordEndColon = line.indexOf(':', cursor);
    let wordEnd = line.length;
    if (wordEndSearch >= 0 && wordEndSearch < wordEnd) wordEnd = wordEndSearch;
    if (wordEndColon >= 0 && wordEndColon < wordEnd) wordEnd = wordEndColon;
    const word = line.substring(wordStart, wordEnd).trim();
    if (!word) return null;

    // 查找当前段落
    const section = findSectionAtLine(document, position.line);
    if (!section) return null;

    // 匹配字段
    const fields = getSectionFields(section);
    const normalized = word.replace(/[_\s]/g, '').toLowerCase();
    const field = fields.find(f => f.label.replace(/[_\s]/g, '').toLowerCase() === normalized);
    if (!field) return null;

    // 格式化悬停内容
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${field.label}**  \n`);
    if (field.valueType) {
      md.appendMarkdown(`类型: \`${field.valueType}\`  \n`);
    }
    md.appendMarkdown(`描述: ${field.detail}  \n`);
    if (field.example) {
      md.appendMarkdown(`\n示例:\n\`\`\`ini\n${field.label}: ${field.example}\n\`\`\``);
    }

    return new vscode.Hover(md);
  }
}

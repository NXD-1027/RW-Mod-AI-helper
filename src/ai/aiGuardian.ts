import * as vscode from 'vscode';
import { t } from '../i18n';

const DIAGNOSTIC_SOURCE = 'rwMod-guardian';

/**
 * 必填字段定义：段落 → 必须存在的字段列表
 */
const REQUIRED_FIELDS: Record<string, string[]> = {
  core: ['name', 'maxhp', 'price', 'mass', 'radius'],
  graphics: ['image'],
  attack: ['canattack', 'canattackflyingunits', 'canattacklandunits', 'canattackunderwaterunits'],
  movement: ['movementtype'],
  turret: ['x', 'y'],
  projectile: ['life'],
};

/**
 * AI 守门员 — 检查 INI 文件必填字段是否缺失
 *
 * 逻辑：
 * - 如果文件用了 copyFrom → 跳过检查（字段可能在继承的文件里）
 * - 如果某个段落存在，但缺少必填字段 → warning
 */
export class AiGuardianProvider {
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

    const diagnostics = this.analyze(document);
    this.collection.set(document.uri, diagnostics);
  }

  private analyze(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    // 检测是否有 copyFrom（有继承就跳过检查）
    if (this.hasCopyFrom(lines)) {
      return [];
    }

    // 解析文档结构：段落名 → 该段落内存在的字段名集合
    const sections = this.parseSections(lines);

    for (const [sectionName, existingKeys] of sections) {
      const required = REQUIRED_FIELDS[sectionName];
      if (!required) continue;

      for (const field of required) {
        if (existingKeys.has(field)) continue;

        // 找到段落标题行，在后面标 warning
        const sectionLine = this.findSectionLine(lines, sectionName);
        if (sectionLine < 0) continue;

        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(sectionLine, 0, sectionLine, lines[sectionLine].length),
          t('missingRequiredField', field),
          vscode.DiagnosticSeverity.Warning,
        ));
      }

      // projectile 特殊处理：directDamage 或 areaDamage 至少要有一个
      if (sectionName === 'projectile') {
        const hasDirect = existingKeys.has('directdamage');
        const hasArea = existingKeys.has('areadamage');
        if (!hasDirect && !hasArea) {
          const sectionLine = this.findSectionLine(lines, 'projectile');
          if (sectionLine >= 0) {
            diagnostics.push(new vscode.Diagnostic(
              new vscode.Range(sectionLine, 0, sectionLine, lines[sectionLine].length),
              t('missingDirectOrAreaDamage'),
              vscode.DiagnosticSeverity.Warning,
            ));
          }
        }
      }
    }

    return diagnostics;
  }

  /**
   * 检查是否存在 copyFrom（不区分段落，只要文件里有就跳过）
   */
  private hasCopyFrom(lines: string[]): boolean {
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^copyFrom\s*[:=]/i.test(trimmed)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 解析文档，返回 段落名 → 该段落内的字段名(小写)集合
   */
  private parseSections(lines: string[]): Map<string, Set<string>> {
    const sections = new Map<string, Set<string>>();
    let currentSection = '';

    for (const line of lines) {
      const secMatch = line.trim().match(/^\[([^\]]+)\]\s*$/);
      if (secMatch) {
        currentSection = this.normalizeSectionName(secMatch[1]);
        if (!sections.has(currentSection)) {
          sections.set(currentSection, new Set());
        }
        continue;
      }

      if (!currentSection) continue;

      const kvMatch = line.match(/^\s*([a-zA-Z_]\w*)\s*[:=]/);
      if (kvMatch) {
        const key = kvMatch[1].toLowerCase();
        sections.get(currentSection)?.add(key);
      }
    }

    return sections;
  }

  /**
   * 段落名归一化：多实例段落取其前缀
   * turret_1 → turret, projectile_3 → projectile, action_fire → action
   */
  private normalizeSectionName(name: string): string {
    const lower = name.toLowerCase();
    const multiSections = ['turret', 'projectile', 'action', 'hiddenaction', 'effect',
      'animation', 'canbuild', 'leg', 'arm', 'attachment', 'placementrule',
      'resource', 'template', 'decal', 'comment', 'global_resource'];

    for (const prefix of multiSections) {
      if (lower === prefix || lower.startsWith(prefix + '_')) {
        return prefix;
      }
    }
    return lower;
  }

  private findSectionLine(lines: string[], sectionName: string): number {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].trim().match(/^\[([^\]]+)\]\s*$/);
      if (m && this.normalizeSectionName(m[1]) === sectionName) {
        return i;
      }
    }
    return -1;
  }
}

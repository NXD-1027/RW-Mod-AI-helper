import * as fs from 'fs';
import * as path from 'path';

/**
 * 文档分块 - 把一个文档按标题/段落切成小块
 */
export interface DocChunk {
  id: string;
  title: string;        // 章节标题或单位名称
  content: string;      // 块内容
  source: string;       // 来源文件名
  category: string;     // 分类（units/weapons/tech/lua/tips）
  tags: string[];       // 关键词标签
}

/**
 * 文档加载器 - 读取知识库文件夹，解析为可索引的块
 * 支持：.md / .txt / .json / .ini
 */
export class DocumentLoader {
  /**
   * 扫描文件夹，加载所有文档并切块
   */
  static async loadFromDirectory(dirPath: string): Promise<DocChunk[]> {
    const chunks: DocChunk[] = [];

    if (!fs.existsSync(dirPath)) {
      console.warn(`[MOD助手] 知识库目录不存在: ${dirPath}`);
      return chunks;
    }

    const files = this.scanFiles(dirPath);

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      try {
        const fileChunks = await this.loadFile(filePath, dirPath);
        chunks.push(...fileChunks);
      } catch (err) {
        console.error(`[MOD助手] 读取文件失败: ${filePath}`, err);
      }
    }

    console.log(`[MOD助手] 加载了 ${chunks.length} 个知识块，来自 ${files.length} 个文件`);
    return chunks;
  }

  /**
   * 递归扫描所有支持的文档文件
   */
  private static scanFiles(dirPath: string): string[] {
    // 新增 .ini 支持
    const supportedExts = ['.md', '.txt', '.json', '.ini'];
    const files: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.scanFiles(fullPath));
      } else if (entry.isFile() && supportedExts.includes(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }

    return files.sort();
  }

  /**
   * 加载单个文件，按扩展名选择解析方式
   */
  private static async loadFile(filePath: string, baseDir: string): Promise<DocChunk[]> {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(baseDir, filePath);
    const category = this.inferCategory(filePath, baseDir);

    if (ext === '.json') {
      return this.splitJson(content, relativePath, category);
    } else if (ext === '.ini') {
      return this.splitIni(content, relativePath, category);
    } else {
      return this.splitMarkdown(content, relativePath, category);
    }
  }

  /**
   * 从目录结构推断分类（支持中文目录名）
   */
  private static inferCategory(filePath: string, baseDir: string): string {
    const rel = path.relative(baseDir, filePath).toLowerCase();
    if (rel.includes('unit') || rel.includes('单位')) return 'units';
    if (rel.includes('weapon') || rel.includes('武器')) return 'weapons';
    if (rel.includes('tech') || rel.includes('科技')) return 'tech';
    if (rel.includes('lua') || rel.includes('script') || rel.includes('脚本')) return 'lua';
    if (rel.includes('tip') || rel.includes('faq') || rel.includes('错误') || rel.includes('技巧')) return 'tips';
    if (rel.includes('schema') || rel.includes('ref') || rel.includes('字段') || rel.includes('参考')) return 'reference';
    if (rel.includes('建筑') || rel.includes('建筑')) return 'buildings';
    if (rel.includes('飞机') || rel.includes('空军') || rel.includes('air')) return 'air';
    if (rel.includes('海军') || rel.includes('ship') || rel.includes('sub')) return 'navy';
    return 'general';
  }

  // ─── INI 解析 ───

  /**
   * 解析铁锈战争 INI 文件
   * 格式：
   *   [section]       ← 节标题
   *   key: value      ← 键值对（冒号分隔）
   *   # comment       ← 注释
   *
   * 每个 [section] 变成一块，同时整份文件也作为一块
   */
  private static splitIni(content: string, source: string, category: string): DocChunk[] {
    const blocks: DocChunk[] = [];
    const lines = content.split(/\r?\n/);
    let currentSection = '__header__';
    let currentLines: string[] = [];
    let sectionIndex = 0;

    // 提取单位名称（从 [core] 段的 name 字段）
    let unitName = '';

    // 按节切分，同时收集单位名
    for (const line of lines) {
      const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (sectionMatch) {
        if (currentLines.length > 0) {
          blocks.push(this.makeIniChunk(
            currentSection, currentLines, source, category, sectionIndex++, unitName
          ));
        }
        currentSection = sectionMatch[1].trim();
        currentLines = [line];
      } else {
        currentLines.push(line);
        // 在 [core] 段内收集单位名
        if (!unitName && currentSection === 'core') {
          const kv = this.parseKeyValue(line);
          if (kv && kv.key === 'name') {
            unitName = kv.value;
          }
        }
      }
    }
    // 最后一块
    if (currentLines.length > 0) {
      blocks.push(this.makeIniChunk(
        currentSection, currentLines, source, category, sectionIndex++, unitName
      ));
    }

    return blocks;
  }

  /**
   * 创建 INI 分块
   */
  private static makeIniChunk(
    section: string, lines: string[], source: string,
    category: string, index: number, unitName: string
  ): DocChunk {
    const content = lines.join('\n').trim();
    const title = unitName ? `${unitName} - ${section}` : `${source} - ${section}`;

    // 提取标签
    const tags: string[] = [section, category];
    if (unitName) tags.push(unitName);

    // 从键值对中提取关键词
    for (const line of lines) {
      const kv = this.parseKeyValue(line);
      if (kv) {
        tags.push(kv.key);
        // 把值中的关键词也加进去
        if (kv.value.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
          tags.push(kv.value);
        }
      }
    }

    return {
      id: `${source}::${section}[${index}]`,
      title,
      content,
      source,
      category,
      tags: [...new Set(tags)],
    };
  }

  /**
   * 解析 INI 键值对（支持 key: value 和 key = value）
   */
  private static parseKeyValue(line: string): { key: string; value: string } | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return null;

    // 匹配 key: value 或 key = value
    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(.+)$/);
    if (match) {
      return { key: match[1].toLowerCase(), value: match[2].trim() };
    }
    return null;
  }

  // ─── Markdown / 文本解析 ───

  /**
   * 切分 Markdown / 文本文件 → 按 ## 标题分割
   */
  private static splitMarkdown(content: string, source: string, category: string): DocChunk[] {
    const blocks: DocChunk[] = [];
    const lines = content.split(/\r?\n/);
    let currentTitle = '前言';
    let currentLines: string[] = [];
    let chunkIndex = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^#{2,4}\s+(.+)/);
      if (headerMatch) {
        if (currentLines.length > 0) {
          blocks.push(this.makeChunk(currentTitle, currentLines, source, category, chunkIndex++));
        }
        currentTitle = headerMatch[1].trim();
        currentLines = [line];
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0) {
      blocks.push(this.makeChunk(currentTitle, currentLines, source, category, chunkIndex++));
    }

    return blocks;
  }

  private static makeChunk(
    title: string, lines: string[], source: string, category: string, index: number
  ): DocChunk {
    const content = lines.join('\n').trim();
    const words = content
      .toLowerCase()
      .replace(/[#*`\[\]]/g, '')
      .split(/[\s,，。、；：]+/)
      .filter(w => w.length > 1 && !['this', 'that', 'the', 'and', 'or', 'for', 'with'].includes(w))
      .slice(0, 10);

    return {
      id: `${source}::${index}`,
      title,
      content,
      source,
      category,
      tags: [...new Set([title.toLowerCase(), category, ...words])],
    };
  }

  // ─── JSON 解析 ───

  /**
   * 切分 JSON 文件
   */
  private static splitJson(content: string, source: string, category: string): DocChunk[] {
    const blocks: DocChunk[] = [];
    let data: any;
    try {
      data = JSON.parse(content);
    } catch {
      return this.splitMarkdown(content, source, category);
    }

    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        const name = item.name || item.id || `entry_${index}`;
        blocks.push({
          id: `${source}::${name}`,
          title: `${name}`,
          content: JSON.stringify(item, null, 2),
          source,
          category,
          tags: this.extractTags(item),
        });
      });
    } else if (typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        blocks.push({
          id: `${source}::${key}`,
          title: key,
          content: typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value),
          source,
          category,
          tags: [key, category].filter(Boolean),
        });
      }
    }

    return blocks;
  }

  private static extractTags(obj: any): string[] {
    const tags: string[] = [];
    if (obj.name) tags.push(String(obj.name).toLowerCase());
    if (obj.type) tags.push(String(obj.type).toLowerCase());
    if (obj.category) tags.push(String(obj.category).toLowerCase());
    if (obj.tags && Array.isArray(obj.tags)) {
      tags.push(...obj.tags.map(String));
    }
    return tags;
  }
}

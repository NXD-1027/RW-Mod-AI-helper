/**
 * INI 文件格式化
 * - 按段落内的最长键名对齐冒号
 * - 保留注释、空行、段落顺序
 * - 支持 : 和 = 作为分隔符
 */

/** 段落标题 */
const SECTION_RE = /^\s*\[.*\]\s*$/;
/** 注释行 */
const COMMENT_RE = /^\s*[;#]/;
/** 键值对: 前导空格 + 键名 + 分隔符 + 空格 + 值 + 空格 + 注释 */
const KV_RE = /^(\s*)([^=:#]+?)(\s*[:=])(\s*)(.*?)(\s*)([;#].*)?$/;

/**
 * 对齐括号两侧间距
 */
function normalizeParens(value: string): string {
  return value
    .replace(/([^\s(])\(/g, '$1 (')
    .replace(/\)([^\s)])/g, ') $1');
}

/**
 * 格式化 INI 文本
 */
export function formatIni(text: string): string {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];

  // 按段落分组
  let sections: { header: string; bodyLines: number[] }[] = [];
  let currentSection: { header: string; bodyLines: number[] } | null = null;
  let contentBeforeFirstSection: number[] = [];

  const isSection = (ln: string) => SECTION_RE.test(ln);
  const isComment = (ln: string) => COMMENT_RE.test(ln);
  const isEmpty = (ln: string) => ln.trim() === '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (isSection(raw)) {
      currentSection = { header: raw.trimEnd(), bodyLines: [] };
      sections.push(currentSection);
    } else if (currentSection) {
      currentSection.bodyLines.push(i);
    } else {
      contentBeforeFirstSection.push(i);
    }
  }

  // 写入第一个段落前的内容（注释、空行等）
  for (const idx of contentBeforeFirstSection) {
    result.push(lines[idx].trimEnd());
  }

  // 处理每个段落内的对齐
  for (const sec of sections) {
    // 找出段落内的最大键长
    let maxKeyLen = 0;
    const kvEntries = new Map<number, { key: string; sep: string; value: string; comment: string; indent: string }>();

    for (const idx of sec.bodyLines) {
      const ln = lines[idx];
      if (isEmpty(ln) || isComment(ln)) continue;

      const m = ln.match(KV_RE);
      if (m) {
        const key = m[2].trim();
        const sep = m[3].trim();
        const rawValue = m[5].trim();
        const value = /(?:^|\b)(?:self\.|if\s|%\{|\$\{|@)/i.test(rawValue)
          ? rawValue
          : normalizeParens(rawValue);
        const comment = m[7] || '';

        kvEntries.set(idx, {
          key,
          sep,
          value,
          comment,
          indent: m[1],
        });

        if (key.length > maxKeyLen) maxKeyLen = key.length;
      }
    }

    // 段落标题
    result.push(sec.header);

    // 重新构建段落内容
    for (const idx of sec.bodyLines) {
      const ln = lines[idx];

      if (isEmpty(ln)) {
        // 保留段落内的空行（最多一个）
        const last = result[result.length - 1];
        if (last !== undefined && last !== '') {
          result.push('');
        }
        continue;
      }

      if (isComment(ln)) {
        result.push(ln.trimEnd());
        continue;
      }

      const entry = kvEntries.get(idx);
      if (entry) {
        const padding = ' '.repeat(maxKeyLen - entry.key.length);
        const valuePart = entry.value ? ` ${entry.value}` : '';
        const commentPart = entry.comment ? ` ${entry.comment.trim()}` : '';
        result.push(`${entry.indent}${entry.key}${padding} ${entry.sep}${valuePart}${commentPart}`);
      } else {
        // 不匹配 KV 的行，原样保留
        result.push(ln.trimEnd());
      }
    }
  }

  // 段落之间用一个空行分隔
  const final: string[] = [];
  for (let i = 0; i < result.length; i++) {
    const ln = result[i];
    if (i > 0 && ln.startsWith('[') && final[final.length - 1] !== '') {
      final.push(''); // 段落前加空行
    }
    final.push(ln);
  }

  // 去掉开头的空行
  while (final.length > 0 && final[0] === '') {
    final.shift();
  }

  // 保留原文件的结尾换行
  const hasTrailingNewline = /\r?\n$/.test(text);
  const out = final.join('\n');
  return hasTrailingNewline ? out + '\n' : out;
}

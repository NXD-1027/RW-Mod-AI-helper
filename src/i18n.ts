import * as vscode from 'vscode';

type Lang = 'zh' | 'en';

function currentLang(): Lang {
  const l = vscode.env.language;
  if (l === 'zh-cn' || l === 'zh-tw' || l === 'zh') return 'zh';
  return 'en';
}

type Strings = Record<string, Record<Lang, string>>;

const strings: Strings = {
  // ── 诊断消息 ──
  resourceNotFound: {
    zh: '资源文件不存在: {0}',
    en: 'Resource file not found: {0}',
  },
  duplicateField: {
    zh: '⚠️ 重复属性 "{0}"（首次在行 {1}）',
    en: '⚠️ Duplicate field "{0}" (first on line {1})',
  },
  unitRefNotFound: {
    zh: '单位引用不存在: {0}',
    en: 'Unit reference not found: {0}',
  },
  missingRequiredField: {
    zh: '缺少必填字段: {0}',
    en: 'Missing required field: {0}',
  },
  missingDirectOrAreaDamage: {
    zh: '缺少必填字段: directDamage 或 areaDamage（至少选一个）',
    en: 'Missing required field: directDamage or areaDamage (at least one required)',
  },
  unusedMemoryVar: {
    zh: '未使用的记忆变量: {0}',
    en: 'Unused memory variable: {0}',
  },
  alreadyHasField: {
    zh: '⚠️ [{0}] {1} — 已有该属性',
    en: '⚠️ [{0}] {1} — Already exists',
  },
  noUnitsFound: {
    zh: '📭 未在项目中发现单位',
    en: '📭 No units found in project',
  },
  unitName: {
    zh: '单位名',
    en: 'Unit name',
  },
  replaceWith: {
    zh: '替换为 {0}',
    en: 'Replace with {0}',
  },
  noResourcesFound: {
    zh: '未在项目中发现匹配资源',
    en: 'No matching resources found in project',
  },
  imageNotFound: {
    zh: '🔍 检测到图片路径: `{0}`\n\n未找到文件，请确认路径是否正确。',
    en: '🔍 Image path detected: `{0}`\n\nFile not found. Please verify the path.',
  },

  // ── 内存变量补全 ──
  defineMemoryVar: {
    zh: '定义内存变量',
    en: 'Define memory variable',
  },
  defineLocalVar: {
    zh: '定义局部变量',
    en: 'Define local variable',
  },
  defineGlobalVar: {
    zh: '定义全局变量',
    en: 'Define global variable',
  },
  memoryVarUsage: {
    zh: '在 action 中通过 memory.xxx 访问',
    en: 'Access via memory.xxx in actions',
  },
  localVarUsage: {
    zh: '仅当前 template 有效',
    en: 'Only valid in current template',
  },
  globalVarUsage: {
    zh: '可在任何地方引用',
    en: 'Can be referenced anywhere',
  },
  memoryVarTemplate: {
    zh: '在 [template] 中定义的变量\n用法: {0} = 值',
    en: 'Defined in [template]\nUsage: {0} = value',
  },

  // ── 扩展 UI ──
  welcomeTitle: {
    zh: '# 🎮 铁锈战争 MOD 助手\n\nINI 补全、格式化、悬停提示、颜色预览和大纲视图已可用。\n\n如果需要 AI 问答或生成单位，请点击顶部 "Key" 设置 API Key；普通编辑功能不需要 API Key。\n\n### 你可以问\n- "帮我做一辆反装甲坦克，速度 2.0 左右"\n- "分析一下侦察车这个单位"\n- "激光坦克的 weapon 段怎么写"',
    en: '# 🎮 Rusted Warfare MOD Assistant\n\nINI completion, formatting, hover hints, color preview and outline are ready.\n\nIf you need AI chat or unit generation, click "Key" to set an API Key; editing features work without one.\n\n### You can ask\n- "Create an anti-armor tank with speed around 2.0"\n- "Analyze the scout unit"\n- "How to write the weapon section for a laser tank"',
  },
  aiSwitchProvider: {
    zh: 'AI 服务商已切换为 {0}，请设置对应的 API Key。',
    en: 'AI provider switched to {0}. Please set the corresponding API Key.',
  },
  apiKeyConfigured: {
    zh: '✅ {0} API Key 已配置成功！',
    en: '✅ {0} API Key configured successfully!',
  },
  apiEndpointSet: {
    zh: '🌐 API 端点已设置为 {0}',
    en: '🌐 API endpoint set to {0}',
  },
  apiEndpointCleared: {
    zh: '🌐 API 端点已清空',
    en: '🌐 API endpoint cleared',
  },
  thinking: {
    zh: '🤔 正在思考如何修改 "{0}"...',
    en: '🤔 Thinking how to modify "{0}"...',
  },
  aiReturnFormatError: {
    zh: '❌ AI 返回格式异常，请重试。',
    en: '❌ AI returned an unexpected format. Please try again.',
  },
  noChanges: {
    zh: '🤷 AI 没有做出任何修改',
    en: '🤷 AI made no changes',
  },
  modifyComplete: {
    zh: '✏️ 修改完成，请查看下方 Diff 预览并确认：',
    en: '✏️ Modification complete. Check the diff preview below and confirm:',
  },
  modifyApplied: {
    zh: '✅ 修改已应用到 "{0}"',
    en: '✅ Changes applied to "{0}"',
  },
  modifyCancelled: {
    zh: '❌ 已取消修改',
    en: '❌ Modification cancelled',
  },
  modifyFailed: {
    zh: '❌ 修改失败：{0}',
    en: '❌ Modification failed: {0}',
  },
  generating: {
    zh: '🤔 正在生成单位...',
    en: '🤔 Generating unit...',
  },
  generateFailed: {
    zh: '❌ 生成失败：{0}',
    en: '❌ Generation failed: {0}',
  },
  needApiKey: {
    zh: '⚠️ 请先设置 API Key',
    en: '⚠️ Please set an API Key first',
  },
  needOpenFile: {
    zh: '⚠️ 请先打开一个文件',
    en: '⚠️ Please open a file first',
  },
  noEditorNewFile: {
    zh: '没有打开的编辑器，是否新建 INI 文件？',
    en: 'No editor open. Create a new INI file?',
  },
  newFile: {
    zh: '新建文件',
    en: 'New file',
  },
  cancel: {
    zh: '取消',
    en: 'Cancel',
  },
  codeInserted: {
    zh: '✅ 代码已插入到当前文件',
    en: '✅ Code inserted into current file',
  },
  codeCopied: {
    zh: '✅ 代码已复制到剪贴板',
    en: '✅ Code copied to clipboard',
  },
  fileCreated: {
    zh: '✅ 已创建新 INI 文件',
    en: '✅ New INI file created',
  },
  setKeyPrompt: {
    zh: '使用 AI 功能前需要先设置 API Key',
    en: 'An API Key is required before using AI features',
  },
  goToSettings: {
    zh: '去设置',
    en: 'Go to Settings',
  },
  iniFormatDone: {
    zh: 'INI 格式化完成（无需更改）',
    en: 'INI formatting complete (no changes needed)',
  },
  iniFormatSuccess: {
    zh: '✅ INI 格式化完成',
    en: '✅ INI formatting complete',
  },

  // ── WebView UI ──
  tabChat: { zh: '💬 对话', en: '💬 Chat' },
  tabModify: { zh: '✏️ 修改', en: '✏️ Modify' },
  tabGenerate: { zh: '🔫 生成', en: '🔫 Generate' },
  btnKnowledge: { zh: '📂 知识库', en: '📂 Knowledge' },
  btnClear: { zh: '🗑️ 清空', en: '🗑️ Clear' },
  btnSetKey: { zh: '设置', en: 'Setup' },
  btnDeleteKey: { zh: '删除', en: 'Delete' },
  aiChecking: { zh: 'AI: 检查中...', en: 'AI: checking...' },
  aiNotConfigured: { zh: '未设置 Key', en: 'No Key set' },
  aiConfigured: { zh: '已设置 Key', en: 'Key set' },
  inputPlaceholder: { zh: '描述你想要的单位或提问...', en: 'Describe a unit or ask a question...' },
  btnSend: { zh: '发送', en: 'Send' },
  currentFile: { zh: '当前文件：', en: 'Current file: ' },
  noFileOpen: { zh: '未打开', en: 'none' },
  modifyPlaceholder: { zh: '例如：把血量改成 500、加一个激光武器', en: 'e.g.: Change HP to 500, add a laser weapon' },
  modifyBtnText: { zh: '✏️ 开始修改', en: '✏️ Start Modify' },
  generatePlaceholder: { zh: '例如：每秒射5发、伤害20的反装甲轻型坦克', en: 'e.g.: Anti-armor light tank, 5 shots/sec, 20 dmg' },
  generateBtnText: { zh: '🔫 开始生成', en: '🔫 Start Generate' },
  modifyHint: { zh: '打开一个 INI 文件，在这里描述要修改的内容', en: 'Open an INI file, then describe your changes here' },
  generateHint: { zh: '描述你想要的新单位，AI 会生成完整的 INI 配置', en: 'Describe the unit you want, AI will generate a complete INI config' },
  thinkingDots: { zh: '⏳ 处理中...', en: '⏳ Processing...' },
};

/**
 * 返回 WebView 需要的所有 UI 字符串（展平对象，key→翻译后文本）
 */
export function getWebviewLocale(): Record<string, string> {
  const lang = currentLang();
  const webviewKeys = [
    'tabChat', 'tabModify', 'tabGenerate', 'btnKnowledge', 'btnClear',
    'btnSetKey', 'btnDeleteKey', 'aiChecking', 'aiNotConfigured', 'aiConfigured',
    'inputPlaceholder', 'btnSend', 'currentFile', 'noFileOpen',
    'modifyPlaceholder', 'modifyBtnText', 'generatePlaceholder', 'generateBtnText',
    'modifyHint', 'generateHint', 'thinkingDots', 'needApiKey', 'needOpenFile',
  ];
  const result: Record<string, string> = {};
  for (const key of webviewKeys) {
    const entry = strings[key];
    if (entry) result[key] = entry[lang] || entry['en'] || key;
  }
  return result;
}

/**
 * 获取当前语言的字符串，支持 {0} {1} 占位符替换
 */
export function t(key: string, ...args: string[]): string {
  const entry = strings[key];
  if (!entry) return key;

  const text = entry[currentLang()] || entry['en'] || key;
  return text.replace(/\{(\d+)\}/g, (_, idx) => args[parseInt(idx)] ?? `{${idx}}`);
}

/**
 * 获取当前语言 (zh/en)
 */
export function getLanguage(): Lang {
  return currentLang();
}

/**
 * AI 系统提示词的语言指令
 */
export function aiLanguageInstruction(): string {
  return currentLang() === 'zh'
    ? '如果用户没指定，用中文回答'
    : 'Respond in English by default. If the user asks in another language, reply in that language.';
}

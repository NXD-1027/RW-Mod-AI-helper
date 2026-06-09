import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KnowledgeBase } from './rag/knowledgeBase';
import { AiProvider } from './ai/aiProvider';
import { t } from './i18n';
import { ChatPanel } from './panel/chatPanel';
import { RwCompletionProvider, scanDuplicates } from './ai/completionProvider';
import { RwHoverProvider } from './ai/hoverProvider';
import { RwColorProvider } from './ai/colorProvider';
import { IniFoldingRangeProvider } from './ai/iniFoldingProvider';
import { MemoryCompletionProvider } from './ai/memoryCompletionProvider';
import { IniOutlineProvider } from './ai/iniOutlineProvider';
import { UnitNameCompletionProvider } from './ai/unitNameProvider';
import { RwDocumentLinkProvider } from './ai/documentLinkProvider';
import { ResourceDiagnosticProvider } from './ai/resourceDiagnosticProvider';
import { ResourcePathCompletionProvider } from './ai/resourcePathCompletionProvider';
import { UnitReferenceDiagnosticProvider } from './ai/unitReferenceDiagnosticProvider';
import { ResourceQuickFixProvider } from './ai/resourceQuickFixProvider';
import { MemoryDiagnosticProvider } from './ai/memoryDiagnosticProvider';
import { AiGuardianProvider } from './ai/aiGuardian';

// 全局单例
let knowledgeBase: KnowledgeBase;
let aiProvider: AiProvider;
let chatPanel: ChatPanel;

interface KnowledgeLoadStep {
  label: string;
  path?: string;
  addedChunks: number;
  ok: boolean;
  detail?: string;
}

interface KnowledgeLoadReport {
  totalChunks: number;
  sources: number;
  categories: Record<string, number>;
  userKnowledgeDir?: string;
  steps: KnowledgeLoadStep[];
}

/**
 * 扩展激活时调用
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('[MOD助手] 激活中...');

  // 关闭 rusted-warfare 语言的单词补全，避免干扰
  try {
    const langConfig = vscode.workspace.getConfiguration('', { languageId: 'rusted-warfare' });
    langConfig.update('editor.wordBasedSuggestions', 'off', vscode.ConfigurationTarget.Global);
  } catch (e) {
    console.warn('[MOD助手] 无法关闭单词补全（可能无权限修改全局设置）:', e);
  }

  // 初始化知识库
  knowledgeBase = new KnowledgeBase();
  const builtinKnowledgeDir = context.extensionPath + '/knowledge';

  async function reloadKnowledgeBase(userKnowledgeDir?: string): Promise<KnowledgeLoadReport> {
    knowledgeBase.clear();
    const steps: KnowledgeLoadStep[] = [];

    async function loadDirectory(label: string, dir: string): Promise<void> {
      const before = knowledgeBase.getStats().totalChunks;
      if (!fs.existsSync(dir)) {
        steps.push({
          label,
          path: dir,
          addedChunks: 0,
          ok: false,
          detail: '目录不存在',
        });
        return;
      }

      try {
        await knowledgeBase.addFromDirectory(dir);
        const addedChunks = knowledgeBase.getStats().totalChunks - before;
        steps.push({
          label,
          path: dir,
          addedChunks,
          ok: true,
          detail: addedChunks > 0 ? undefined : '没有找到可加载文档',
        });
      } catch (err: any) {
        console.warn(`[MOD助手] ${label}加载失败:`, err);
        steps.push({
          label,
          path: dir,
          addedChunks: 0,
          ok: false,
          detail: err?.message || String(err),
        });
      }
    }

    // 1. 加载内置知识库（随插件打包的 knowledge/ 目录）
    await loadDirectory('内置 knowledge/', builtinKnowledgeDir);

    // 2. 添加代码内置的参考知识（字段说明、常见错误等）
    const beforeBuiltin = knowledgeBase.getStats().totalChunks;
    knowledgeBase.addBuiltinKnowledge();
    steps.push({
      label: '代码内置知识',
      addedChunks: knowledgeBase.getStats().totalChunks - beforeBuiltin,
      ok: true,
    });

    // 3. 追加用户自定义知识库
    if (userKnowledgeDir && userKnowledgeDir !== builtinKnowledgeDir) {
      await loadDirectory('用户知识库', userKnowledgeDir);
    } else if (userKnowledgeDir === builtinKnowledgeDir) {
      steps.push({
        label: '用户知识库',
        path: userKnowledgeDir,
        addedChunks: 0,
        ok: true,
        detail: '与内置 knowledge/ 相同，已跳过重复加载',
      });
    }

    const stats = knowledgeBase.getStats();
    return {
      totalChunks: stats.totalChunks,
      sources: stats.sources.length,
      categories: stats.categories,
      userKnowledgeDir: userKnowledgeDir || undefined,
      steps,
    };
  }

  function formatKnowledgeLoadReport(report: KnowledgeLoadReport): string {
    const stepLines = report.steps.map(step => {
      const status = step.ok ? 'OK' : '失败';
      const pathText = step.path ? `\n  路径: ${step.path}` : '';
      const detailText = step.detail ? `\n  说明: ${step.detail}` : '';
      return `- ${step.label}: ${status}，新增 ${step.addedChunks} 个知识块${pathText}${detailText}`;
    });

    const categoryText = Object.entries(report.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} ${count}`)
      .join('，') || '无';

    return [
      `知识库加载完成：共 ${report.totalChunks} 个知识块，${report.sources} 个来源。`,
      `分类：${categoryText}`,
      ...stepLines,
    ].join('\n');
  }

  const config = vscode.workspace.getConfiguration('rwMod');
  const knowledgeDir = config.get<string>('knowledgeDir') || '';
  const initialKnowledgeReport = await reloadKnowledgeBase(knowledgeDir);

  // 初始化 AI 提供商
  aiProvider = new AiProvider();
  await aiProvider.init(context);


  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('rwMod.aiProvider')) {
        await aiProvider.init(context);
        const provider = vscode.workspace.getConfiguration('rwMod').get<string>('aiProvider') || 'openai';
        chatPanel?.appendMessage(
          'system',
          aiProvider.isConfigured
            ? `AI 服务商已切换为 ${provider}，已读取对应 API Key。`
            : `AI 服务商已切换为 ${provider}，尚未设置对应 API Key。`
        );
        chatPanel?.refreshApiStatus();
      }
    })
  );

  // ── 注册侧边栏面板 ──
  chatPanel = new ChatPanel(context, aiProvider, knowledgeBase);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanel.viewType, chatPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // ── 注册智能补全（逐步实现） ──
  // 当前：段落名补全 + [core] 字段名补全
  const provider = new RwCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('rusted-warfare', provider, '[', ':')
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('ini', provider, '[', ':')
  );

  // ── 注册 INI 格式化 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.formatIni', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const doc = editor.document;
      if (doc.languageId !== 'rusted-warfare' && doc.languageId !== 'ini') {
        vscode.window.showWarningMessage('请在 INI 文件中使用此命令');
        return;
      }
      const fullText = doc.getText();
      const { formatIni } = await import('./format/iniFormatter');
      const formatted = formatIni(fullText);
      if (formatted === fullText) {
        vscode.window.showInformationMessage('INI 格式化完成（无需更改）');
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(fullText.length)
      );
      edit.replace(doc.uri, fullRange, formatted);
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage('✅ INI 格式化完成');
    })
  );

  // ── 注册自定义文件后缀管理 ──
  const ASSOC_KEY = 'files.associations';

  function getCustomExtensions(): string[] {
    const assoc = vscode.workspace.getConfiguration().get<Record<string, string>>(ASSOC_KEY) || {};
    return Object.entries(assoc)
      .filter(([, v]) => v === 'rusted-warfare')
      .map(([k]) => k.replace(/^\*\./, ''));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.addCustomExtension', async () => {
      const ext = await vscode.window.showInputBox({
        prompt: '输入文件后缀（如 cfg、conf、unit）',
        placeHolder: 'cfg',
        validateInput: (v) => v && /^[a-zA-Z0-9_.]+$/.test(v) ? null : '只允许字母、数字、下划线、点',
      });
      if (!ext) return;

      const config = vscode.workspace.getConfiguration();
      const assoc = config.get<Record<string, string>>(ASSOC_KEY) || {};
      assoc[`*.${ext}`] = 'rusted-warfare';
      await config.update(ASSOC_KEY, assoc, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`✅ .${ext} 已关联到 MOD 助手`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.removeCustomExtension', async () => {
      const exts = getCustomExtensions();
      if (exts.length === 0) {
        vscode.window.showInformationMessage('当前没有自定义后缀');
        return;
      }
      const pick = await vscode.window.showQuickPick(exts, {
        placeHolder: '选择要移除的后缀',
      });
      if (!pick) return;

      const config = vscode.workspace.getConfiguration();
      const assoc = config.get<Record<string, string>>(ASSOC_KEY) || {};
      delete assoc[`*.${pick}`];
      await config.update(ASSOC_KEY, assoc, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`🗑️ .${pick} 已移除关联`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.listCustomExtensions', () => {
      const exts = getCustomExtensions();
      if (exts.length === 0) {
        vscode.window.showInformationMessage('当前没有自定义后缀');
        return;
      }
      vscode.window.showInformationMessage(`已关联后缀: ${exts.map(e => `.${e}`).join(', ')}`);
    })
  );

  // ── 注册颜色预览 ──
  context.subscriptions.push(
    vscode.languages.registerColorProvider(
      { language: 'rusted-warfare' },
      new RwColorProvider()
    )
  );
  context.subscriptions.push(
    vscode.languages.registerColorProvider(
      { language: 'ini' },
      new RwColorProvider()
    )
  );

  // ── 注册代码折叠 ──
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'rusted-warfare' },
      new IniFoldingRangeProvider()
    )
  );
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: 'ini' },
      new IniFoldingRangeProvider()
    )
  );

  // ── 注册大纲视图 ──
  const outlineProvider = new IniOutlineProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'rusted-warfare' },
      outlineProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'ini' },
      outlineProvider
    )
  );

  // ── 注册单位名补全 ──
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'rusted-warfare' },
      new UnitNameCompletionProvider(),
      ':'
    )
  );

  // ── 注册资源路径补全 ──
  const resourcePathCompletionProvider = new ResourcePathCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'rusted-warfare' },
      resourcePathCompletionProvider,
      ':', '/', '\\', '.'
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'ini' },
      resourcePathCompletionProvider,
      ':', '/', '\\', '.'
    )
  );

  // ── 注册跨文件引用跳转 ──
  const documentLinkProvider = new RwDocumentLinkProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'rusted-warfare' },
      documentLinkProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'ini' },
      documentLinkProvider
    )
  );

  // ── 注册记忆变量补全 ──
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'rusted-warfare' },
      new MemoryCompletionProvider(),
      '@', 'm', '.'
    )
  );

  // ── 注册悬停提示 ──
  const hoverProvider = new RwHoverProvider();
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('rusted-warfare', hoverProvider)
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('ini', hoverProvider)
  );

  // ── 注册重复字段诊断（红色波浪线 + 黄色背景 + 补全标注） ──
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('rwMod-duplicates');
  context.subscriptions.push(diagnosticCollection);
  const resourceDiagnostics = new ResourceDiagnosticProvider();
  context.subscriptions.push(resourceDiagnostics);
  const unitReferenceDiagnostics = new UnitReferenceDiagnosticProvider();
  context.subscriptions.push(unitReferenceDiagnostics);
  const memoryDiagnostics = new MemoryDiagnosticProvider();
  context.subscriptions.push(memoryDiagnostics);
  const aiGuardian = new AiGuardianProvider();
  context.subscriptions.push(aiGuardian);

  // ── 注册资源路径 Quick Fix ──
  const resourceQuickFixProvider = new ResourceQuickFixProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'rusted-warfare' },
      resourceQuickFixProvider,
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'ini' },
      resourceQuickFixProvider,
    )
  );

  // 黄色背景装饰：标记首次出现的重复字段
  const dupDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.25)',
    isWholeLine: true,
    overviewRulerColor: 'rgba(255, 255, 0, 0.6)',
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
  context.subscriptions.push(dupDecoration);

  /** 对指定文档刷新重复字段的标记 */
  function refreshDuplicateMarkers(document: vscode.TextDocument) {
    const result = scanDuplicates(document);
    if (!result) {
      diagnosticCollection.delete(document.uri);
      return;
    }

    // 更新诊断（红色波浪线→重复项）
    diagnosticCollection.set(document.uri, result.diagnostics);

    // 更新黄色背景（首次出现的位置）
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === document.uri.toString()) {
        editor.setDecorations(dupDecoration, result.firstOccurrenceRanges);
      }
    }
  }

  // 文档内容变化时更新标记
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      refreshDuplicateMarkers(event.document);
      void resourceDiagnostics.refresh(event.document);
      void unitReferenceDiagnostics.refresh(event.document);
      void memoryDiagnostics.refresh(event.document);
      void aiGuardian.refresh(event.document);
    })
  );

  // 编辑器切换时重新应用装饰
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      chatPanel?.refreshModifyFileName();
      if (editor) {
        refreshDuplicateMarkers(editor.document);
        void resourceDiagnostics.refresh(editor.document);
        void unitReferenceDiagnostics.refresh(editor.document);
        void memoryDiagnostics.refresh(editor.document);
        void aiGuardian.refresh(editor.document);
      }
    })
  );

  // 打开已有文档时立即检查
  if (vscode.window.activeTextEditor) {
    refreshDuplicateMarkers(vscode.window.activeTextEditor.document);
    void resourceDiagnostics.refresh(vscode.window.activeTextEditor.document);
    void unitReferenceDiagnostics.refresh(vscode.window.activeTextEditor.document);
    void memoryDiagnostics.refresh(vscode.window.activeTextEditor.document);
    void aiGuardian.refresh(vscode.window.activeTextEditor.document);
  }

// ── 注册命令 ──

  async function ensureApiConfigured(): Promise<boolean> {
    if (aiProvider.isConfigured) {
      return true;
    }

    const setKey = await vscode.window.showWarningMessage(
      '使用 AI 功能前需要先设置 API Key',
      '去设置',
      '取消'
    );
    if (setKey === '去设置') {
      await vscode.commands.executeCommand('rwMod.setApiKey');
      return aiProvider.isConfigured;
    }
    return false;
  }

  // 打开面板
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.rwModSidebar');
    })
  );

  // 启动确认
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.hello', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.rwModSidebar');
      vscode.window.showInformationMessage('铁锈战争 MOD 助手已启动，INI 补全和格式化已可用');
    })
  );

  // 设置 API Key / 端点 / 服务商
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.setApiKey', async () => {
      const currentConfig = vscode.workspace.getConfiguration('rwMod');
      const currentProvider = currentConfig.get<string>('aiProvider') || 'openai';
      const currentEndpoint = currentConfig.get<string>('aiEndpoint') || '';

      const choice = await vscode.window.showQuickPick([
        { label: '🔑 设置 API Key', detail: `当前服务商: ${currentProvider}`, picked: true },
        { label: '🌐 设置 API 端点', detail: currentEndpoint ? `当前: ${currentEndpoint}` : '仅自定义服务商需要' },
        { label: '🔄 切换 AI 服务商', detail: `当前: ${currentProvider}` },
      ], { placeHolder: '选择要配置的项', ignoreFocusOut: true });

      if (!choice) return;

      if (choice.label.includes('API Key')) {
        const provider = currentConfig.get<string>('aiProvider') || 'openai';
        const key = await vscode.window.showInputBox({
          prompt: `请输入 ${provider} API Key`,
          password: true,
          placeHolder: provider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
          ignoreFocusOut: true,
        });
        if (!key) return;
        await context.secrets.store(`${provider}-api-key`, key);
        await aiProvider.init(context);
        vscode.window.showInformationMessage('✅ API Key 已保存！');
        chatPanel.appendMessage('system', `✅ ${provider} API Key 已配置成功！`);
        chatPanel.refreshApiStatus();
      } else if (choice.label.includes('API 端点')) {
        const endpoint = await vscode.window.showInputBox({
          prompt: '请输入 API 端点地址',
          placeHolder: 'https://api.openai.com/v1',
          value: currentEndpoint || 'https://api.openai.com/v1',
          ignoreFocusOut: true,
        });
        if (endpoint === undefined) return;
        await currentConfig.update('aiEndpoint', endpoint, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(endpoint ? '✅ API 端点已设置' : '🗑️ API 端点已清空');
        chatPanel.appendMessage('system', endpoint ? `🌐 API 端点已设置为 ${endpoint}` : '🌐 API 端点已清空');
        chatPanel.refreshApiStatus();
      } else if (choice.label.includes('服务商')) {
        const provider = await vscode.window.showQuickPick([
          { label: 'openai', description: 'OpenAI / 兼容端点' },
          { label: 'anthropic', description: 'Anthropic Claude' },
          { label: 'custom', description: '自定义端点（需同时设置 API 端点地址）' },
        ], { placeHolder: '选择 AI 服务商' });
        if (!provider) return;
        await currentConfig.update('aiProvider', provider, vscode.ConfigurationTarget.Global);
        await aiProvider.init(context);
        chatPanel.appendMessage('system', `🔄 AI 服务商已切换为 ${provider.label}，请设置对应的 API Key。`);
        chatPanel.refreshApiStatus();

        // 如果切换到 custom，自动提示设置端点
        if (provider.label === 'custom') {
          const setEndpoint = await vscode.window.showInformationMessage(
            '自定义服务商需要设置 API 端点地址，是否现在设置？',
            '设置端点', '稍后'
          );
          if (setEndpoint === '设置端点') {
            vscode.commands.executeCommand('rwMod.setApiKey');
          }
        }
      }
    })
  );

  // 删除当前 AI 服务商的 API Key
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.deleteApiKey', async () => {
      const currentConfig = vscode.workspace.getConfiguration('rwMod');
      const provider = currentConfig.get<string>('aiProvider') || 'openai';
      const confirm = await vscode.window.showWarningMessage(
        `确定删除当前 ${provider} API Key 吗？`,
        '删除',
        '取消'
      );
      if (confirm !== '删除') {
        return;
      }

      await context.secrets.delete(`${provider}-api-key`);
      await aiProvider.init(context);
      vscode.window.showInformationMessage(`已删除 ${provider} API Key`);
      chatPanel.appendMessage('system', `已删除 ${provider} API Key。AI 功能需要重新设置 Key 后才能使用。`);
      chatPanel.refreshApiStatus();
    })
  );

  // 选择知识库目录
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.selectKnowledgeDir', async () => {
      const result = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        title: '选择知识库文件夹',
      });
      if (result && result.length > 0) {
        const dir = result[0].fsPath;
        await config.update('knowledgeDir', dir, vscode.ConfigurationTarget.Global);
        const report = await reloadKnowledgeBase(dir);
        const failedSteps = report.steps.filter(step => !step.ok);
        const message = `知识库已加载：${report.totalChunks} 个知识块，${report.sources} 个来源`;
        if (failedSteps.length > 0) {
          vscode.window.showWarningMessage(`${message}，但有 ${failedSteps.length} 项加载失败`);
        } else {
          vscode.window.showInformationMessage(message);
        }
        chatPanel.appendMessage('system', formatKnowledgeLoadReport(report));
      }
    })
  );

  // 向 AI 发送消息（核心聊天功能）
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.sendMessage', async () => {
      if (!(await ensureApiConfigured())) {
        return;
      }

      const text = await vscode.window.showInputBox({
        prompt: '向 MOD 助手提问',
        placeHolder: '例如：帮我分析侦察车这个单位 / 做一个反装甲坦克',
        ignoreFocusOut: true,
      });
      if (!text) return;

      // 打开侧边栏
      vscode.commands.executeCommand('workbench.view.extension.rwModSidebar');

      // 等待面板就绪
      await chatPanel.waitUntilReady();

      // 处理消息
      await handleChatMessage(text);
    })
  );

  // 从命令面板向 AI 提问
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.askAI', async () => {
      await vscode.commands.executeCommand('rwMod.sendMessage');
    })
  );

  // 用AI生成单位（命令面板 + 右键）
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.generateUnit', async (inputText) => {
      if (!(await ensureApiConfigured())) return;

      const request = inputText || await vscode.window.showInputBox({
        prompt: '描述你想要的新单位',
        placeHolder: '例如：每秒射5发、伤害20的反装甲轻型坦克',
        ignoreFocusOut: true,
      });
      if (!request) return;

      try {
        const ctx = knowledgeBase.isReady ? knowledgeBase.buildContext(request) : '';
        const result = await aiProvider.chat([
          { role: 'system', content: AiProvider.buildSystemPrompt(ctx) },
          { role: 'user', content: '请根据以下需求生成一个铁锈战争单位 INI 配置：\n\n' + request + '\n\n要求：\n1. 使用 INI 格式，用 [section] 分段\n2. 数值要平衡（参考原版同类单位）\n3. 包含 [core] [graphics] [attack] [movement] 等必要段落\n4. 用代码块包裹输出' },
        ]);

        const m = result.content.match(/```ini\n?([\s\S]*?)```/);
        if (!m) { vscode.window.showErrorMessage('AI 返回格式异常'); return; }
        const iniContent = m[1].trim();

        const action = await vscode.window.showInformationMessage(
          '单位已生成 ✅  选择操作：',
          '📄 插入当前文件',
          '📝 新建文件',
          '📋 复制代码'
        );

        if (action === '📄 插入当前文件') {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            await editor.insertSnippet(new vscode.SnippetString(iniContent));
          } else {
            const r = await vscode.window.showWarningMessage('没有打开的编辑器，是否新建文件？', '新建文件', '取消');
            if (r === '新建文件') {
              const doc = await vscode.workspace.openTextDocument({ content: iniContent, language: 'ini' });
              await vscode.window.showTextDocument(doc);
            }
          }
        } else if (action === '📝 新建文件') {
          const doc = await vscode.workspace.openTextDocument({ content: iniContent, language: 'ini' });
          await vscode.window.showTextDocument(doc);
        } else if (action === '📋 复制代码') {
          await vscode.env.clipboard.writeText(iniContent);
        }
      } catch (err: any) {
        vscode.window.showErrorMessage('生成失败：' + (err.message || err));
      }
    })
  );

  // 解析当前单位（右键菜单）
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.explainUnit', async (uri?: vscode.Uri) => {
      let filePath: string | undefined;

      if (uri) {
        filePath = uri.fsPath;
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          filePath = editor.document.uri.fsPath;
        }
      }

      if (!filePath) {
        vscode.window.showWarningMessage('请先打开一个单位 INI 文件');
        return;
      }

      try {
        const content = vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const text = Buffer.from(await content).toString('utf-8');
        const fileName = filePath.split(/[\\/]/).pop() || '';

        if (filePath.endsWith('.ini')) {
          const nameMatch = text.match(/displayText:\s*(.+)/) || text.match(/^name:\s*(.+)/m);
          const hpMatch = text.match(/maxHp:\s*(\d+)/);
          const priceMatch = text.match(/price:\s*(\d+)/);
          const speedMatch = text.match(/moveSpeed:\s*([\d.]+)/);

          const name = nameMatch ? nameMatch[1].trim() : fileName;
          const hp = hpMatch ? hpMatch[1] : '?';
          const price = priceMatch ? priceMatch[1] : '?';
          const speed = speedMatch ? speedMatch[1] : '?';

          vscode.window.showInformationMessage(`📋 ${name} | HP: ${hp} | 造价: ${price} | 速度: ${speed}`);

          // 如果 AI 已配置，自动在侧边栏分析
          if (aiProvider.isConfigured) {
            vscode.commands.executeCommand('workbench.view.extension.rwModSidebar');
            await new Promise(r => setTimeout(r, 300));
            const summary = buildUnitAnalysisSnippet(text);
            await handleChatMessage(`请分析这个铁锈战争单位的属性、用途、武器配置、移动方式和可能的平衡问题：\n\`\`\`ini\n${summary}\n\`\`\``);
          }
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`读取失败：${err.message}`);
      }
    })
  );

  // 解释选中的 INI 配置片段
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.explainSelection', async () => {
      if (!(await ensureApiConfigured())) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('请先打开一个 INI 文件并选中要解释的配置');
        return;
      }

      const doc = editor.document;
      if (doc.languageId !== 'rusted-warfare' && doc.languageId !== 'ini') {
        vscode.window.showWarningMessage('请在 INI 文件中使用此命令');
        return;
      }

      const selectedText = editor.selections
        .filter(selection => !selection.isEmpty)
        .map(selection => doc.getText(selection))
        .join('\n\n');

      if (!selectedText.trim()) {
        vscode.window.showWarningMessage('请先选中一段要解释的配置');
        return;
      }

      await vscode.commands.executeCommand('workbench.view.extension.rwModSidebar');
      await new Promise(r => setTimeout(r, 300));

      const fileName = doc.fileName.split(/[\\/]/).pop() || '当前文件';
      const currentSection = findNearestSectionName(doc, editor.selection.active.line);
      const clippedText = limitText(selectedText.trim(), 5000);
      const sectionText = currentSection ? `当前所在段落：${currentSection}\n` : '';

      await handleChatMessage(`请用通俗但准确的中文解释下面这段铁锈战争 MOD INI 配置。请说明：
1. 这段配置的作用
2. 关键字段分别影响什么
3. 它可能依赖哪些其他 section 或单位
4. 是否有明显风险或容易写错的地方

文件：${fileName}
${sectionText}
\`\`\`ini
${clippedText}
\`\`\``);
    })
  );

  // 清空对话
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.clearChat', () => {
      chatPanel.clearMessages();
      chatPanel.appendMessage('system', '对话已清空 ✨');
    })
  );

  // 显示欢迎语
  chatPanel.appendMessage('assistant', t('welcomeTitle'));
  chatPanel.appendMessage('system', formatKnowledgeLoadReport(initialKnowledgeReport));

  // ── AI 修改文件 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.aiModifyFile', async (inputText) => {
      if (!(await ensureApiConfigured())) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('请先打开一个文件');
        return;
      }

      const request = inputText || await vscode.window.showInputBox({
        prompt: '描述你要怎么修改这个文件',
        placeHolder: '例如：把血量改成 500、加一个激光武器',
        ignoreFocusOut: true,
      });
      if (!request) return;

      const doc = editor.document;
      const originalContent = doc.getText();
      const fileName = doc.fileName.split(/[\\/]/).pop() || '';

      try {
        // 调 AI
        const context = knowledgeBase.isReady
          ? knowledgeBase.buildContext(request)
          : '';
        const systemPrompt = AiProvider.buildModifySystemPrompt(context);
        const result = await aiProvider.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `当前文件内容（${fileName}）：\n\n\`\`\`ini\n${originalContent}\n\`\`\`\n\n修改要求：${request}` },
        ]);

        // 解析 AI 回复中的 INI 代码块
        const codeBlockMatch = result.content.match(/```ini\n?([\s\S]*?)```/);
        if (!codeBlockMatch) {
          vscode.window.showErrorMessage('AI 返回格式异常，请重试');
          return;
        }
        const modifiedContent = codeBlockMatch[1].trim();

        // 如果内容没变化，提前退出
        if (modifiedContent === originalContent) {
          vscode.window.showInformationMessage('AI 没有做出任何修改');
          return;
        }

        // 创建临时文件用于 diff
        const tempFileName = `ai-modify-${Date.now()}-${fileName}`;
        const tempFilePath = path.join(os.tmpdir(), tempFileName);
        const tempUri = vscode.Uri.file(tempFilePath);
        await vscode.workspace.fs.writeFile(tempUri, Buffer.from(modifiedContent, 'utf-8'));

        // 打开 diff 视图
        await vscode.commands.executeCommand('vscode.diff', doc.uri, tempUri, `AI 修改: ${fileName}`);

        // 确认对话框
        const action = await vscode.window.showInformationMessage(
          'AI 建议了以上修改，是否应用？',
          { modal: true },
          '✅ 确认应用',
          '❌ 取消'
        );

        if (action === '✅ 确认应用') {
          const editRange = new vscode.Range(
            doc.positionAt(0),
            doc.positionAt(originalContent.length)
          );
          const applyEdit = new vscode.WorkspaceEdit();
          applyEdit.replace(doc.uri, editRange, modifiedContent);
          await vscode.workspace.applyEdit(applyEdit);
          vscode.window.showInformationMessage('✅ 修改已应用');

          // 尝试关闭临时文件的 diff 标签
          try {
            for (const group of vscode.window.tabGroups.all) {
              for (const tab of group.tabs) {
                const input = tab.input as any;
                const tabUri = input?.uri || input?.modified;
                if (tabUri?.toString() === tempUri.toString()) {
                  vscode.window.tabGroups.close(tab);
                }
              }
            }
          } catch { /* 静默 */ }
        }

        // 清理临时文件
        try {
          await vscode.workspace.fs.delete(tempUri);
        } catch { /* 静默 */ }
      } catch (err: any) {
        vscode.window.showErrorMessage(`AI 修改失败：${err.message || err}`);
      }
    })
  );

  // ── 补全辅助命令 ──
  context.subscriptions.push(
    vscode.commands.registerCommand('rwMod.cursorRight', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const pos = editor.selection.active;
        const newPos = pos.translate(0, 1);
        // 只移动光标，不选中任何字符
        editor.selection = new vscode.Selection(newPos, newPos);
      }
    })
  );

  console.log('[MOD助手] 激活完成！');
}

/**
 * 处理聊天消息
 * 调用 AI API，支持流式输出到侧边栏
 */
async function handleChatMessage(text: string): Promise<void> {
  if (!text.trim()) return;

  // 显示用户消息
  chatPanel.appendMessage('user', text);
  chatPanel.addMessage({ role: 'user', content: text });
  chatPanel.showLoading();

  try {
    // 从知识库检索相关内容
    let context = '';
    if (knowledgeBase.isReady) {
      context = knowledgeBase.buildContext(text);
    }

    // 构建消息
    const systemPrompt = AiProvider.buildSystemPrompt(context || '（暂无知识库）');

    // 调用 AI（流式输出）
    const result = await aiProvider.chat(
      [
        { role: 'system', content: systemPrompt },
        ...chatPanel.messages.slice(-10),
      ],
      (chunk) => {
        chatPanel.streamChunk(chunk);
      }
    );

    // 完成
    chatPanel.finalizeStream();
    chatPanel.addMessage({ role: 'assistant', content: result.content });

  } catch (err: any) {
    chatPanel.finalizeStream();
    const errMsg = `❌ 出错了：${err.message || err}`;
    chatPanel.appendMessage('assistant', errMsg);
    chatPanel.addMessage({ role: 'assistant', content: errMsg });
  }
}

interface IniSection {
  name: string;
  content: string;
  index: number;
}

function buildUnitAnalysisSnippet(text: string, maxTotalChars = 6000): string {
  const sections = parseIniSections(text);
  if (sections.length === 0) {
    return limitText(text, maxTotalChars);
  }

  const selected = selectImportantSections(sections);
  const chunks: string[] = [];
  let total = 0;
  let includedCount = 0;

  for (const section of selected) {
    const budget = getSectionBudget(section.name);
    const content = limitText(section.content.trim(), budget);
    const chunk = content.startsWith(`[${section.name}]`)
      ? content
      : `[${section.name}]\n${content}`;

    if (total + chunk.length > maxTotalChars) {
      const remaining = maxTotalChars - total;
      if (remaining > 300) {
        chunks.push(limitText(chunk, remaining));
        includedCount++;
      }
      break;
    }

    chunks.push(chunk);
    includedCount++;
    total += chunk.length + 2;
  }

  const omittedCount = sections.length - includedCount;
  if (omittedCount > 0 && total < maxTotalChars - 80) {
    chunks.push(`; 已省略 ${omittedCount} 个低优先级 section，优先保留了单位分析最关键的段落。`);
  }

  return chunks.join('\n\n');
}

function parseIniSections(text: string): IniSection[] {
  const lines = text.split(/\r?\n/);
  const sections: IniSection[] = [];
  let currentName = '';
  let currentLines: string[] = [];
  let currentIndex = 0;

  function pushCurrent() {
    if (!currentName) {
      return;
    }
    sections.push({
      name: currentName,
      content: currentLines.join('\n'),
      index: currentIndex,
    });
  }

  for (const line of lines) {
    const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (match) {
      pushCurrent();
      currentName = match[1].trim();
      currentLines = [line];
      currentIndex = sections.length;
    } else if (currentName) {
      currentLines.push(line);
    }
  }

  pushCurrent();
  return sections;
}

function selectImportantSections(sections: IniSection[]): IniSection[] {
  const priority = (name: string): number => {
    const lower = name.toLowerCase();
    if (lower === 'core') return 0;
    if (lower === 'attack') return 1;
    if (lower === 'movement') return 2;
    if (lower.startsWith('turret_')) return 3;
    if (lower.startsWith('projectile_')) return 4;
    if (lower === 'graphics') return 5;
    if (lower.startsWith('action_')) return 6;
    if (lower.startsWith('canbuild_')) return 7;
    if (lower.startsWith('effect_')) return 8;
    if (lower.startsWith('animation_')) return 9;
    if (lower.startsWith('hiddenaction_')) return 10;
    return 20;
  };

  return [...sections]
    .sort((a, b) => {
      const byPriority = priority(a.name) - priority(b.name);
      return byPriority || a.index - b.index;
    });
}

function getSectionBudget(name: string): number {
  const lower = name.toLowerCase();
  if (lower === 'core') return 1200;
  if (lower === 'attack') return 900;
  if (lower === 'movement') return 900;
  if (lower === 'graphics') return 800;
  if (lower.startsWith('turret_')) return 700;
  if (lower.startsWith('projectile_')) return 700;
  if (lower.startsWith('action_')) return 600;
  return 450;
}

function limitText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.slice(0, maxChars);
  const lastLineBreak = truncated.lastIndexOf('\n');
  const safeText = lastLineBreak > maxChars * 0.6
    ? truncated.slice(0, lastLineBreak)
    : truncated;

  return `${safeText}\n; ... 此段过长，已截断`;
}

function findNearestSectionName(document: vscode.TextDocument, line: number): string | undefined {
  for (let i = line; i >= 0; i--) {
    const match = document.lineAt(i).text.match(/^\s*\[([^\]]+)\]\s*$/);
    if (match) {
      return `[${match[1].trim()}]`;
    }
  }

  return undefined;
}

/**
 * 扩展停用时调用
 */
export function deactivate() {
  console.log('[MOD助手] 已停用');
}

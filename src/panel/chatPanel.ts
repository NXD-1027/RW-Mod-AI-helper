import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AiProvider, ChatMessage } from '../ai/aiProvider';
import { KnowledgeBase } from '../rag/knowledgeBase';
import { t, getLanguage, getWebviewLocale } from '../i18n';

/**
 * 侧边栏 AI 对话面板
 */
export class ChatPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'rwModPanel';

  private _view?: vscode.WebviewView;
  private _ai!: AiProvider;
  private _knowledge!: KnowledgeBase;
  private _messages: ChatMessage[] = [];
  private _resolveReady: (() => void) | null = null;
  private _ready: Promise<void> = new Promise(resolve => { this._resolveReady = resolve; });

  // 待确认的修改操作（AI 结果暂存，等用户确认后应用）
  private _pendingModify: {
    document: vscode.TextDocument;
    originalContent: string;
    modifiedContent: string;
    fileName: string;
    tempUri: vscode.Uri;
  } | null = null;

  constructor(
    private _context: vscode.ExtensionContext,
    ai: AiProvider,
    knowledge: KnowledgeBase
  ) {
    this._ai = ai;
    this._knowledge = knowledge;
  }

  /**
   * 等待面板就绪（resolveWebviewView 被调用后 resolve）
   */
  async waitUntilReady(): Promise<void> {
    return this._ready;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    this._resolveReady?.();

    webviewView.webview.options = {
      enableScripts: true,
    };

    // 生成 nonce 用于 CSP
    const nonce = this.getNonce();

    webviewView.webview.html = this.getHtml(nonce, webviewView.webview);

    // 接收来自 webview 的消息
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      console.log('[MOD助手] 收到 WebView 消息:', msg.type);
      try {
        switch (msg.type) {
          case 'sendMessage':
            await this.handleUserMessage(msg.text);
            break;
          case 'setApiKey':
            await vscode.commands.executeCommand('rwMod.setApiKey');
            this.refreshApiStatus();
            break;
          case 'deleteApiKey':
            await vscode.commands.executeCommand('rwMod.deleteApiKey');
            this.refreshApiStatus();
            break;
          case 'loadKnowledge':
            await this.selectKnowledgeDir();
            break;
          case 'generateUnit':
            vscode.commands.executeCommand('rwMod.generateUnit');
            break;
          case 'modifyFileFromTab':
            await this.handleModifyFile(msg.text);
            break;
          case 'generateUnitFromTab':
            await this.handleGenerateUnit(msg.text);
            break;
          case 'confirmAccept':
            await this.applyPendingModify();
            break;
          case 'confirmCancel':
            await this.cancelPendingModify();
            break;
          case 'modifyFile':
            vscode.commands.executeCommand('rwMod.aiModifyFile');
            break;
          case 'clearChat':
            this._messages = [];
            this.appendMessage('system', '对话已清空 ✨');
            break;
          case 'codeBlockAction':
            await this.handleCodeBlockAction(msg.action, msg.code, msg.lang);
            break;
        }
      } catch (err: any) {
        console.error('[MOD助手] 处理消息失败:', err);
      }
    });

    this.refreshApiStatus();
    this.refreshModifyFileName();
  }

  /**
   * 在侧边栏显示一条消息
   */
  appendMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this._view?.webview.postMessage({
      type: 'appendMessage',
      role,
      content,
    });
  }

  streamChunk(chunk: string): void {
    this._view?.webview.postMessage({ type: 'streamChunk', content: chunk });
  }

  finalizeStream(): void {
    this._view?.webview.postMessage({ type: 'finalizeStream' });
  }

  showLoading(): void {
    this._view?.webview.postMessage({ type: 'showLoading' });
  }

  refreshApiStatus(): void {
    const config = vscode.workspace.getConfiguration('rwMod');
    const provider = config.get<string>('aiProvider') || this._ai.providerName || 'openai';

    this._view?.webview.postMessage({
      type: 'apiStatus',
      provider,
      configured: this._ai.isConfigured,
    });
  }

  refreshModifyFileName(): void {
    const editor = vscode.window.activeTextEditor;
    const fileName = editor ? editor.document.fileName.split(/[\\/]/).pop() || '未命名' : '未打开';
    this._view?.webview.postMessage({
      type: 'updateModifyFileName',
      fileName,
    });
  }

  get ai(): AiProvider { return this._ai; }
  get knowledge(): KnowledgeBase { return this._knowledge; }
  get messages(): ChatMessage[] { return this._messages; }

  addMessage(msg: ChatMessage): void {
    this._messages.push(msg);
    if (this._messages.length > 20) this._messages = this._messages.slice(-20);
  }

  clearMessages(): void {
    this._messages = [];
  }

  // ── 消息处理 ──

  private async handleUserMessage(text: string): Promise<void> {
    if (!text.trim()) return;

    this.appendMessage('user', text);
    this.addMessage({ role: 'user', content: text });

    if (!this._ai.isConfigured) {
      this.appendMessage('system', '⚠️ 请先设置 API Key\n命令面板 → "MOD助手: 设置 API Key"');
      return;
    }

    this.showLoading();

    try {
      const context = this._knowledge.isReady
        ? this._knowledge.buildContext(text)
        : '';

      const systemPrompt = AiProvider.buildSystemPrompt(context);

      const result = await this._ai.chat(
        [
          { role: 'system', content: systemPrompt },
          ...this._messages.slice(-10),
        ],
        (chunk) => {
          this.streamChunk(chunk);
        }
      );

      this.finalizeStream();
      this.addMessage({ role: 'assistant', content: result.content });

    } catch (err: any) {
      this.finalizeStream();
      const errMsg = `❌ ${err.message || err}`;
      this.appendMessage('assistant', errMsg);
      this.addMessage({ role: 'assistant', content: errMsg });
    }
  }

  private async selectKnowledgeDir(): Promise<void> {
    await vscode.commands.executeCommand('rwMod.selectKnowledgeDir');
  }

  /**
   * 在修改标签页追加进度消息
   */
  private modifyAppend(text: string): void {
    this._view?.webview.postMessage({ type: 'modifyAppend', text });
  }

  /**
   * 修改标签页流程：思考 → 修改 → 确认
   */
  private async handleModifyFile(request: string): Promise<void> {
    if (!this._ai.isConfigured) {
      this.modifyAppend(t('needApiKey'));
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.modifyAppend(t('needOpenFile'));
      return;
    }

    const doc = editor.document;
    const originalContent = doc.getText();
    const fileName = doc.fileName.split(/[\\/]/).pop() || '';

    // 1. 思考中
    this.modifyAppend(t('thinking', fileName));

    try {
      // 2. 调用 AI
      const ctx = this._knowledge.isReady ? this._knowledge.buildContext(request) : '';
      const systemPrompt = AiProvider.buildModifySystemPrompt(ctx);
      const result = await this._ai.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `当前文件内容（${fileName}）：\n\n\`\`\`ini\n${originalContent}\n\`\`\`\n\n修改要求：${request}` },
      ]);

      // 3. 解析结果
      const codeBlockMatch = result.content.match(/```ini\n?([\s\S]*?)```/);
      if (!codeBlockMatch) {
        this.modifyAppend(t('aiReturnFormatError'));
        return;
      }
      const modifiedContent = codeBlockMatch[1].trim();

      if (modifiedContent === originalContent) {
        this.modifyAppend(t('noChanges'));
        return;
      }

      // 4. 显示修改说明
      const beforeCodeBlock = result.content.split(/```/)[0]?.trim();
      if (beforeCodeBlock) {
        this._view?.webview.postMessage({ type: 'modifyResult', content: beforeCodeBlock });
      }

      this.modifyAppend(t('modifyComplete'));

      // 5. 创建临时文件 + 打开 diff
      const tempFileName = `ai-modify-${Date.now()}-${fileName}`;
      const tempFilePath = path.join(os.tmpdir(), tempFileName);
      const tempUri = vscode.Uri.file(tempFilePath);
      await vscode.workspace.fs.writeFile(tempUri, Buffer.from(modifiedContent, 'utf-8'));
      await vscode.commands.executeCommand('vscode.diff', doc.uri, tempUri, `AI 修改: ${fileName}`);

      // 6. 保存待确认状态
      this._pendingModify = { document: doc, originalContent, modifiedContent, fileName, tempUri };

      // 7. 在修改标签页中显示确认/取消按钮
      this._view?.webview.postMessage({ type: 'modifyConfirm' });
    } catch (err: any) {
      this.modifyAppend(t('modifyFailed', err.message || String(err)));
    }
  }

  /**
   * 生成标签页流程：思考 → 生成
   */
  private async handleGenerateUnit(request: string): Promise<void> {
    if (!this._ai.isConfigured) {
      this._view?.webview.postMessage({
        type: 'generateResult', error: true, content: t('needApiKey'),
      });
      return;
    }

    this._view?.webview.postMessage({ type: 'generateLoading' });

    try {
      const ctx = this._knowledge.isReady ? this._knowledge.buildContext(request) : '';
      const systemPrompt = AiProvider.buildSystemPrompt(ctx);

      // 生成提示词也根据语言调整
      const genPrompt = getLanguage() === 'zh'
        ? `请根据以下需求生成一个铁锈战争单位 INI 配置：\n\n${request}\n\n要求：\n1. 使用 INI 格式，用 [section] 分段\n2. 至少包含 [core] [graphics] [attack] [movement]\n3. 如果有武器，包含 [turret_*] 和 [projectile_*]\n4. 数值参考原版同类单位，保持平衡\n5. buildSpeed 等时间字段可以使用 3s、40s 这类秒单位写法\n6. 输出完整可用的配置`
        : `Generate a Rusted Warfare unit INI config based on the following request:\n\n${request}\n\nRequirements:\n1. Use INI format with [section] blocks\n2. Include at least [core] [graphics] [attack] [movement]\n3. If it has weapons, include [turret_*] and [projectile_*]\n4. Balance stats based on vanilla units\n5. Time fields support seconds notation (3s, 40s)\n6. Output complete, ready-to-use config`;

      const result = await this._ai.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: genPrompt },
      ]);

      this._view?.webview.postMessage({ type: 'generateResult', content: result.content });
    } catch (err: any) {
      this._view?.webview.postMessage({
        type: 'generateResult', error: true, content: err?.message || String(err),
      });
    }
  }

  /**
   * 应用待确认的修改
   */
  private async applyPendingModify(): Promise<void> {
    const pending = this._pendingModify;
    if (!pending) return;

    try {
      const editRange = new vscode.Range(
        pending.document.positionAt(0),
        pending.document.positionAt(pending.originalContent.length)
      );
      const applyEdit = new vscode.WorkspaceEdit();
      applyEdit.replace(pending.document.uri, editRange, pending.modifiedContent);
      await vscode.workspace.applyEdit(applyEdit);
      this.modifyAppend(`✅ 修改已应用到 "${pending.fileName}"`);

      // 关闭 diff 标签 + 清理临时文件
      await this.cleanupTempFile(pending.tempUri);
    } catch (err: any) {
      this.modifyAppend(`❌ 应用修改失败：${err.message || err}`);
    }

    this._pendingModify = null;
  }

  /**
   * 取消待确认的修改
   */
  private async cancelPendingModify(): Promise<void> {
    const pending = this._pendingModify;
    if (!pending) return;

    this.modifyAppend('❌ 已取消修改');
    await this.cleanupTempFile(pending.tempUri);
    this._pendingModify = null;
  }

  /**
   * 关闭 diff 标签页并删除临时文件
   */
  private async cleanupTempFile(tempUri: vscode.Uri): Promise<void> {
    try {
      // 关闭关联的 diff 标签
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input as any;
          const tabUri = input?.uri || input?.modified;
          if (tabUri?.toString() === tempUri.toString()) {
            vscode.window.tabGroups.close(tab);
          }
        }
      }
      // 删除临时文件
      await vscode.workspace.fs.delete(tempUri);
    } catch { /* 静默 */ }
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // ── HTML ──

  private getHtml(nonce: string, _webview: vscode.Webview): string {
    const htmlPath = path.join(this._context.extensionPath, 'assets', 'chatPanel.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/__NONCE__/g, nonce);
    html = html.replace(/__CSP_SOURCE__/g, _webview.cspSource);
    // 注入本地化字符串
    const locale = getWebviewLocale();
    html = html.replace('__LOCALE__', JSON.stringify(locale));
    return html;
  }

  // ── 代码块操作 ──

  /**
   * 处理代码块操作（按钮点击）
   */
  private async handleCodeBlockAction(action: string, code: string, _lang: string): Promise<void> {
    switch (action) {
      case 'insert':
        await this.insertCodeToFile(code);
        break;
      case 'newFile':
        await this.createIniFile(code);
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(code);
        vscode.window.showInformationMessage(t('codeCopied'));
        break;
    }
  }

  /**
   * 将代码插入到当前活动编辑器的光标位置
   */
  private async insertCodeToFile(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      const create = await vscode.window.showWarningMessage(
        t('noEditorNewFile'),
        t('newFile'), t('cancel')
      );
      if (create === t('newFile')) {
        await this.createIniFile(code);
      }
      return;
    }

    const snippet = new vscode.SnippetString(code);
    await editor.insertSnippet(snippet);
    vscode.window.showInformationMessage(t('codeInserted'));
  }

  /**
   * 用代码内容创建新 INI 文件并打开
   */
  private async createIniFile(code: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language: 'ini',
    });
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(t('fileCreated'));
  }
}

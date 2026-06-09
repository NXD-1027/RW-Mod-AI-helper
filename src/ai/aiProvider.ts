import * as vscode from 'vscode';
import { aiLanguageInstruction } from '../i18n';

export interface AiResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AiProvider {
  private apiKey: string = '';
  private provider: string = 'openai';

  async init(context: vscode.ExtensionContext): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('rwMod');
    this.provider = config.get<string>('aiProvider') || 'openai';
    const secretKey = `${this.provider}-api-key`;
    this.apiKey = (await context.secrets.get(secretKey)) || '';
    return this.apiKey.length > 0;
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  get providerName(): string {
    return this.provider;
  }

  async chat(
    messages: ChatMessage[],
    onStream?: (chunk: string) => void
  ): Promise<AiResponse> {
    const config = vscode.workspace.getConfiguration('rwMod');
    const model = config.get<string>('aiModel') || 'gpt-4o';
    const endpoint = config.get<string>('aiEndpoint') || '';

    if (!this.apiKey) {
      throw new Error('请先设置 API Key！');
    }

    if (this.provider === 'openai') {
      return this.callOpenAI(messages, model, endpoint, onStream);
    } else if (this.provider === 'anthropic') {
      return this.callAnthropic(messages, model, endpoint, onStream);
    } else if (this.provider === 'custom') {
      return this.callCustom(messages, model, endpoint, onStream);
    }
    throw new Error(`不支持的 AI 提供商: ${this.provider}`);
  }

  private async callOpenAI(
    messages: ChatMessage[],
    model: string,
    endpoint: string,
    onStream?: (chunk: string) => void
  ): Promise<AiResponse> {
    const baseUrl = endpoint || 'https://api.openai.com/v1';
    const body: any = {
      model: model || 'gpt-4o',
      messages,
      stream: !!onStream,
      max_tokens: 4096,
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${err}`);
    }

    if (onStream) {
      return this.handleStream(response, onStream);
    }

    const data: any = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  }

  private async callAnthropic(
    messages: ChatMessage[],
    model: string,
    endpoint: string,
    onStream?: (chunk: string) => void
  ): Promise<AiResponse> {
    const baseUrl = endpoint || 'https://api.anthropic.com/v1';
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body: any = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: nonSystemMsgs.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    if (onStream) {
      body.stream = true;
    }

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API 请求失败 (${response.status}): ${err}`);
    }

    if (onStream) {
      return this.handleAnthropicStream(response, onStream);
    }

    const data: any = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      model: data.model || model,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  private async callCustom(
    messages: ChatMessage[],
    model: string,
    endpoint: string,
    onStream?: (chunk: string) => void
  ): Promise<AiResponse> {
    if (!endpoint) {
      throw new Error('自定义端点需要设置 API 地址');
    }
    return this.callOpenAI(messages, model, endpoint, onStream);
  }

  private handleStream(response: Response, onStream: (chunk: string) => void): Promise<AiResponse> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let chunkCount = 0;
    const MAX_CHUNKS = 8000;

    return new Promise((resolve) => {
      function pump(): void {
        reader!.read().then(({ done, value }) => {
          if (done) {
            if (buffer.trim()) {
              parseLine(buffer.trim(), onStream, (c) => { fullContent += c; });
            }
            resolve({ content: fullContent, model: '' });
            return;
          }
          chunkCount++;
          if (chunkCount > MAX_CHUNKS) {
            resolve({ content: fullContent, model: '' });
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            parseLine(line.trim(), onStream, (c) => { fullContent += c; });
          }
          pump();
        }).catch(() => resolve({ content: fullContent, model: '' }));
      }
      pump();
    });
  }

  private handleAnthropicStream(response: Response, onStream: (chunk: string) => void): Promise<AiResponse> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    return new Promise((resolve) => {
      function pump(): void {
        reader!.read().then(({ done, value }) => {
          if (done) {
            resolve({ content: fullContent, model: '' });
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  fullContent += parsed.delta.text;
                  onStream(parsed.delta.text);
                }
              } catch { /* 忽略 */ }
            }
          }
          pump();
        }).catch(() => resolve({ content: fullContent, model: '' }));
      }
      pump();
    });
  }

  static buildSystemPrompt(context?: string): string {
    return `你是铁锈战争 (Rusted Warfare) MOD 开发专家。

你的职责是帮助用户创建、修改和优化铁锈战争的 MOD。
你精通 INI 格式的单位配置、武器配置、科技树等所有 MOD 文件。

铁锈战争所有单位配置文件使用 INI 格式，而不是 JSON！
INI 格式示例（以侦察车为例）：
------------------------------------------------
[core]
name: scout
displayText: Scout
class: CustomUnitMetadata
price: 700
maxHp: 350
mass: 500
techLevel: 1
buildSpeed: 3s
radius: 11
displayRadius: 13
fogOfWarSightRange: 22
isBio: false

[graphics]
total_frames: 1
image: base.png
image_wreak: base_dead.png
image_turret: NONE
image_shadow: AUTO
shadowOffsetX: 1
shadowOffsetY: 1

[attack]
canAttack: true
canAttackFlyingUnits: true
canAttackLandUnits: true
turretSize: 7
turretTurnSpeed: 4
maxAttackRange: 110
shootDelay: 50

[projectile_1]
directDamage: 17
life: 70
speed: 6

[movement]
movementType: LAND
moveSpeed: 1.0
moveAccelerationSpeed: 0.03
moveDecelerationSpeed: 0.06
maxTurnSpeed: 2.4
turnAcceleration: 0.2
------------------------------------------------

工作原则：
1. 生成的配置必须使用 INI 格式，按 [section] 分段
2. 注意数值平衡——参考原版同类单位
3. 给出具体的、可直接使用的配置，附带说明
4. ${aiLanguageInstruction()}
5. 时间类字段可使用秒单位写法，如 buildSpeed: 3s、buildSpeed: 40s、shootDelay: 5s；不要误判为非法
6. 不要把下列高级但合法的写法误判为错误：多资源 price/addResources（credits=500, energy=10、credits=-150）、ROOT: 路径、逗号引用列表（copyFrom、builtFrom_1_name、spawnUnits）、LogicBoolean（if self.hp(...)）、动态文本 %{self.resource.ammo}、模板变量 模板变量语法、@memory/@define/@copyFromSection、NONE/AUTO 特殊值
7. 注释请使用 # 开头，不要使用 ; 开头（虽然 ; 也合法，但社区惯例使用 #）

当前参考知识：
${context || '（无额外参考）'}

当用户要求生成单位时，必须包含 [core] [graphics] [attack] [movement] 等必要段落，且 [core] 中必须包含 name、maxHp、price、mass、radius 这五个必填字段。`;
  }

  static buildUnitPrompt(userRequest: string, existingUnits: string[], _context: string): ChatMessage[] {
    return [
      {
        role: 'system',
        content: this.buildSystemPrompt() + `\n\n当前项目中已存在的单位: ${existingUnits.join(', ') || '暂无'}`,
      },
      {
        role: 'user',
        content: `请根据以下需求生成一个铁锈战争单位 INI 配置：\n\n${userRequest}\n\n要求：\n1. 使用 INI 格式，用 [section] 分段\n2. 至少包含 [core] [graphics] [attack] [movement]\n3. 如果有武器，包含 [turret_*] 和 [projectile_*]\n4. 数值参考原版同类单位，保持平衡\n5. buildSpeed 等时间字段可以使用 3s、40s 这类秒单位写法\n6. 输出完整可用的配置`,
      },
    ];
  }

  static buildModifySystemPrompt(_context?: string): string {
    return `你是铁锈战争 (Rusted Warfare) MOD 开发专家。

你的任务是根据用户的修改要求，直接修改 INI 配置文件。
用户会提供完整文件内容，你要返回完整的修改后文件内容。

规则：
1. 只做用户要求的改动，不要擅自修改其他内容
2. 保留所有注释、空行、段落顺序
3. 输出必须用 \`\`\`ini 代码块包裹
4. 如果你认为用户的要求有问题（如数值过于失衡），在代码块外用中文简要说明
5. 如果用户的要求不明确，先做合理推测，同时在代码块外说明你的推测
6. buildSpeed、shootDelay、cooldown 等时间字段可以使用秒单位写法（如 3s、40s、0.5s）
7. 不要把多资源表达式、ROOT: 路径、LogicBoolean、%{...} 动态文本、\${...} 模板变量、@memory/@define、NONE/AUTO 等合法语法改坏
8. 注释请使用 # 开头，不要使用 ; 开头（虽然 ; 也合法，但社区惯例使用 #）`;
  }
}

function parseLine(
  line: string,
  onStream: (chunk: string) => void,
  onContent: (chunk: string) => void,
): void {
  if (!line || line === '') return;
  if (line.startsWith('data: ')) {
    const data = line.slice(6);
    if (data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content || '';
      if (content) {
        onContent(content);
        onStream(content);
      }
    } catch { /* 忽略 */ }
  } else if (line.startsWith('data:')) {
    const data = line.slice(5);
    if (data === '[DONE]') return;
    try {
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content || '';
      if (content) {
        onContent(content);
        onStream(content);
      }
    } catch { /* 忽略 */ }
  }
}

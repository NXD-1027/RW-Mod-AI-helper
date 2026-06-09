import * as path from 'path';
import * as fs from 'fs';
import MiniSearch from 'minisearch';
import { DocChunk, DocumentLoader } from './documentLoader';

export interface SearchResult {
  chunk: DocChunk;
  score: number;
  matchField: 'content' | 'title' | 'tags';
}

export class KnowledgeBase {
  private index: MiniSearch<DocChunk>;
  private chunks: DocChunk[] = [];
  private ready = false;

  constructor() {
    this.index = new MiniSearch<DocChunk>({
      fields: ['title', 'content', 'tags'],
      storeFields: ['id', 'title', 'source', 'category', 'tags'],
      searchOptions: {
        boost: { title: 3, tags: 2, content: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  clear(): void {
    this.chunks = [];
    this.index.removeAll();
    this.ready = false;
  }

  async init(docDir: string): Promise<void> {
    this.chunks = await DocumentLoader.loadFromDirectory(docDir);
    this.rebuildIndex();
    this.ready = true;
    console.log(`[MOD助手] 知识库就绪，共 ${this.chunks.length} 个知识块`);
  }

  async addFromDirectory(docDir: string): Promise<void> {
    const newChunks = await DocumentLoader.loadFromDirectory(docDir);
    if (newChunks.length === 0) {
      console.log(`[MOD助手] 目录 ${docDir} 中没有找到知识文件`);
      return;
    }
    this.chunks.push(...newChunks);
    this.rebuildIndex();
    this.ready = true;
    console.log(`[MOD助手] 追加了 ${newChunks.length} 个知识块，共 ${this.chunks.length} 个`);
  }

  async initWithChunks(chunks: DocChunk[]): Promise<void> {
    this.chunks = chunks;
    this.rebuildIndex();
    this.ready = true;
  }

  private rebuildIndex(): void {
    this.index.removeAll();
    this.index.addAll(this.chunks);
  }

  search(query: string, topN: number = 5): SearchResult[] {
    if (!this.ready || this.chunks.length === 0) return [];

    const results = this.index.search(query, { prefix: true, fuzzy: 0.2 });

    return results.slice(0, topN).map(match => {
      const chunk = this.chunks.find(c => c.id === match.id);
      if (!chunk) return null;

      let matchField: 'content' | 'title' | 'tags' = 'content';
      if (match.match?.title && Array.isArray(match.match.title) && match.match.title.length > 0) matchField = 'title';
      else if (match.match?.tags && Array.isArray(match.match.tags) && match.match.tags.length > 0) matchField = 'tags';

      return {
        chunk,
        score: match.score || 0,
        matchField,
      };
    }).filter((r): r is SearchResult => r !== null);
  }

  /**
   * 搜索并返回纯文本结果（用于 tool calling）
   * 不带 prompt 前缀，只返回知识块内容
   */
  searchAsText(query: string, topN: number = 5): string {
    const results = this.search(query, topN);
    if (results.length === 0) return '';

    const parts: string[] = [];
    const seen = new Set<string>();

    for (const r of results) {
      const key = r.chunk.source + '::' + r.chunk.title;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push('[' + r.chunk.source + ' - ' + r.chunk.title + ']\n' + r.chunk.content.slice(0, 1000));
    }

    return parts.join('\n\n');
  }

  /**
   * 构建 AI prompt 上下文
   */
  buildContext(query: string, maxTokens: number = 3000): string {
    const results = this.search(query, 8);
    if (results.length === 0) return '';

    const charLimit = maxTokens * 4;
    let context = '';
    let usedSources = new Set<string>();

    for (const result of results) {
      const header = `📄 [${result.chunk.source} - ${result.chunk.title}]`;
      const entry = `\n\n${header}\n${result.chunk.content.slice(0, 800)}`;

      if (context.length + entry.length > charLimit) break;

      context += entry;
      usedSources.add(result.chunk.source);
    }

    const preamble = `以下是铁锈战争 MOD 知识库中与"${query}"相关的内容，请基于这些信息回答：\n`;
    return preamble + context + '\n\n';
  }

  getStats(): { totalChunks: number; categories: Record<string, number>; sources: string[] } {
    const categories: Record<string, number> = {};
    const sources = new Set<string>();

    for (const chunk of this.chunks) {
      categories[chunk.category] = (categories[chunk.category] || 0) + 1;
      sources.add(chunk.source);
    }

    return {
      totalChunks: this.chunks.length,
      categories,
      sources: [...sources].sort(),
    };
  }

  get isReady(): boolean {
    return this.ready;
  }

  addBuiltinKnowledge(): void {
    const builtinChunks: DocChunk[] = [
      {
        id: 'builtin::ini-format',
        title: '铁锈战争 INI 格式说明',
        content: `铁锈战争 MOD 使用 INI 格式文件，每行一个配置项。

基本语法：
  [section]       ← 节标题，用方括号括起来
  key: value      ← 键值对，冒号空格分隔
  # comment       ← 注释，以 # 开头

节（section）类型：
  [core]          核心属性（名称、血量、造价、科技等级等）
  [graphics]      图像资源（贴图路径、动画帧）
  [attack]        攻击属性（能否攻击、射程、炮塔参数）
  [turret_XX]     炮塔/武器挂点定义
  [projectile_XX] 弹道/投射物属性
  [movement]      移动属性（移动类型、速度、转向）
  [effect_XX]     特效定义`,
        source: '内置参考',
        category: 'reference',
        tags: ['ini', '格式', '语法', '铁锈战争', 'mod'],
      },
      {
        id: 'builtin::advanced-valid-syntax',
        title: '高级但合法的 INI 写法',
        content: `以下写法在铁锈战争 MOD 中是合法语法，解释或修改时不要误判为错误，也不要随意改写：

1. 多资源与价格表达式：
  price: credits=500, energy=10
  price: gold=5, stone=10
  streamingCost: gem=420
  addResources: credits=-150, energy=1

2. 多文件/多单位引用列表：
  copyFrom: ROOT:defaultTanks.template, tankT1.ini
  builtFrom_1_name: landFactory, airFactory
  altNames: custTank1, customTank1, cTank1
  spawnUnits: support_drone, scout

3. LogicBoolean 与动态数值：
  isVisible: if self.resource(type='credits', greaterThan=150)
  autoTrigger: if self.customTimer(laterThanSeconds=5)
  canAttackLandUnits: if not self.isOverLiquid()
  alpha: self.hp / self.maxHp
  imageScale: 1 + (self.height * 0.1)

4. 动态文本与模板变量：
  text: Fire: %{self.resource.ammo}
  description: Missing hp %{self.maxHp - self.hp}
  @define targetEffect: boom
  spawnEffects: effect_\${targetEffect}
  addResources: credits=\${ int ( core.price * 2 + 10 )

5. 特殊指令和特殊值：
  @copyFromSection: template_name/action_name/projectile_name
  @copyFrom_skipThisSection
  @memory transportCount: float
  image_turret: NONE
  image_shadow: AUTO
  image: ROOT:assets/units/tank.png

这些写法看起来不像普通数字/布尔/字符串，但属于官方参数表支持的高级用法。`,
        source: '内置参考',
        category: 'reference',
        tags: ['高级语法', '合法写法', 'LogicBoolean', 'price', 'ROOT', 'template', 'memory'],
      },
      {
        id: 'builtin::core-fields',
        title: '[core] 核心字段说明',
        content: `[core] 段常用字段：
  name:             单位标识名（如 c_laserTank），用于代码引用
  displayText:      单位显示名称
  displayDescription: 单位描述（\\n 换行）
  class:            固定为 CustomUnitMetadata
  price:            造价（金属）
  maxHp:            最大生命值
  mass:             质量（影响碰撞和运输）
  techLevel:        科技等级（1/2/3）
  buildSpeed:       建造时间/速度，可用小数速度值（如 0.0013）或秒单位时间值（如 3s、40s）
  radius:           碰撞半径
  displayRadius:    显示半径（可略大于碰撞半径）
  fogOfWarSightRange: 视野范围（像素单位）
  isBio:            是否为生物单位
  softCollisionOnAll: 软碰撞
  builtFrom_X_name: 从哪个建筑生产
  builtFrom_X_pos:  生产位置编号`,
        source: '内置参考',
        category: 'reference',
        tags: ['core', '核心', '字段', '单位属性'],
      },
      {
        id: 'builtin::attack-fields',
        title: '[attack] 攻击系统说明',
        content: `[attack] 段常用字段：
  canAttack:              true/false
  canAttackFlyingUnits:   能否对空
  canAttackLandUnits:     能否对地
  canAttackUnderwaterUnits: 能否对水下
  turretSize:             炮塔尺寸
  turretTurnSpeed:        炮塔转向速度
  maxAttackRange:         最大攻击范围（像素）
  shootDelay:             射击间隔（帧，或带单位如 5s）

[turret_XX] 武器挂点：
  x, y:     挂点偏移坐标
  projectile: 关联的弹道 ID（如 laser, 1）
  turnSpeed: 炮管转向速度
  shoot_sound: 射击音效
  shoot_flame: 枪口火焰大小
  recoilOffset: 后坐力偏移
  recoilOutTime / recoilReturnTime: 后坐力动画帧数
  warmup: 预热时间（帧）

[projectile_XX] 弹道/投射物：
  directDamage: 直接伤害
  life: 飞行时间（帧）
  speed: 飞行速度
  instant: true 表示瞬间命中（激光类）
  laserEffect: true 表示激光效果`,
        source: '内置参考',
        category: 'reference',
        tags: ['attack', '武器', '炮塔', '弹道', '伤害'],
      },
      {
        id: 'builtin::movement-fields',
        title: '[movement] 移动系统说明',
        content: `[movement] 段常用字段：
  movementType: 移动类型
    LAND    - 陆地
    HOVER   - 悬浮
    AMPHIBIOUS - 两栖
    NAVAL   - 水面
    SUB     - 水下
    AIR     - 飞行

  moveSpeed:           移动速度
  moveAccelerationSpeed: 加速度
  moveDecelerationSpeed: 减速度
  maxTurnSpeed:        最大转向速度
  turnAcceleration:    转向加速度
  reverseSpeedPercentage: 倒车速度百分比
  moveSlidingMode:     滑动模式（true/false）
  moveIgnoringBody:    忽略车身朝向
  moveSlidingDir:      滑动方向角度`,
        source: '内置参考',
        category: 'reference',
        tags: ['movement', '移动', '速度', 'movementType'],
      },
      {
        id: 'builtin::graphics-fields',
        title: '[graphics] 图像系统说明',
        content: `[graphics] 段常用字段：
  total_frames:    精灵图总帧数
  image:           单位贴图路径
  image_wreak:     残骸贴图路径
  image_turret:    炮塔贴图路径
  image_shadow:    阴影贴图（AUTO=自动）
  shadowOffsetX/Y: 阴影偏移
  animation_moving_start/end: 移动动画起止帧
  animation_moving_speed: 动画速度
  dustEffect:      移动灰尘效果
  splastEffect:    溅水效果
  movementEffect:  自定义移动特效`,
        source: '内置参考',
        category: 'reference',
        tags: ['graphics', '图像', '贴图', '动画'],
      },
      {
        id: 'builtin::common-errors',
        title: '常见错误排查',
        content: `铁锈战争 MOD 常见问题：

1. 单位不出现 → 检查 mod.info 引用是否正确，INI 文件名是否和 mod.info 一致
2. 游戏崩溃 → 检查字段名拼写，注意冒号后面要有空格
3. 贴图不显示 → 检查 image 路径是否正确，图片是否在正确文件夹
4. 单位无敌 → 没写 maxHp 或值设太大
5. 无法建造 → builtFrom_X_name 引用的建筑名不对
6. 武器不发射 → 检查 projectile ID 是否匹配、shootDelay 是否设置正确
7. 单位不动 → movementType 是否设了不能移动的类型
8. 动画不对 → total_frames 和 animation_moving 起止帧配置错误`,
        source: '内置参考',
        category: 'tips',
        tags: ['错误', '调试', 'bug', '常见问题'],
      },
    ];

    this.chunks.push(...builtinChunks);
    this.rebuildIndex();
    this.ready = true;
  }
}

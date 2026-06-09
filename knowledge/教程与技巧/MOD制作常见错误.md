## 一、 基础语法与格式级错误（解析器直接报错/红字）

这类错误会导致游戏在加载 MOD 时直接抛出红字，或者单位根本无法生成。

|错误现象 / 报错关键字|错误代码示例|正确写法 / 产生原因|
|:--|:--|:--|
|**中文标点符号污染**_(最常见的新手死穴)_|`maxHp：1000``price = 500；``text: "开火！ "`|必须全英文半角。`maxHp: 1000``price: 500``text: "开火! "`_(注意：引号内的中文内容可以，但冒号、等号、引号本身必须是英文)_|
|**Unknown key / 拼写错误**|`dispalyText: xxx``maxHP: 100`|`displayText: xxx``maxHp: 100`_(注意：铁锈的 Key 对大小写**部分敏感**，`maxHp` 的 H 必须大写，`displayText` 的 T 必须大写，建议严格对照 Wiki)_|
|**注释符使用不当**|`maxHp: 100 # 这是血量``// 这是注释`|`# 这是血量``maxHp: 100`_(铁锈的解析器对**行内注释**支持极差，`#` 或 `//` 最好*_单独占一行__，写在行尾可能导致前面的数值被当成字符串解析而报错)*|
|**多行文本换行报错**|`description: 这是一个 <br>很长的描述`|`description: 这是一个\n很长的描述`_(INI 不支持直接物理换行，必须使用 `\n` 转义字符)_|
|**Section（节）命名错误**|`[action1]``[attack 1]`|`[action_1]``[attack_1]`_(带序号的节**必须加下划线**，且序号必须从 1 开始连续，不能跳号，如 `[action_1]` 后直接写 `[action_3]` 会导致 3 失效)_|

---

## 二、 核心节（Sections）逻辑错误（能进游戏，但表现异常）

这类错误不会报红字，但会导致单位“缺胳膊少腿”、AI 智障或物理引擎崩坏。

### 1. `[core]` 核心属性

|错误现象|原因分析|解决方案|
|:--|:--|:--|
|**单位无法建造 / 列表里找不到**|1. 缺少 `price`（造价为 0 或负数）。2. 缺少 `techLevel`（科技等级）。3. `buildSpeed` 为 0 或负数。|确保 `price: 100`, `techLevel: 1`, `buildSpeed: 0.05` 等基础属性完整且为正数。|
|**`copyFrom` 继承失效或死循环**|1. 路径写错（未使用 `ROOT:` 或相对路径）。2. A 继承 B，B 又继承 A，导致栈溢出闪退。|使用绝对路径 `copyFrom: ROOT:units/tank_base.ini`。检查继承链，确保没有环形引用。|
|**单位死亡后残留“空气墙”**|`footprint`（碰撞体积）设置过大，且死亡后未清除碰撞，或 `isBuilding` 标志位冲突。|检查 `footprint: 0,0,1,1`（左,上,右,下），确保与图形大小匹配。|

### 2. `[graphics]` 图形与动画

|错误现象|原因分析|解决方案|
|:--|:--|:--|
|**炮塔不转动 / 枪管偏移**|`image_turret` 未定义，或 `aimOffsetSpread` / `aimOffset` 设置不合理。|确保定义了 `image_turret: turret.png`，并调整 `aimOffset`（瞄准偏移角度）和 `recoil`（后坐力）。|
|**贴图边缘有黑边 / 锯齿**|图片缩放或旋转时，Alpha 通道（透明度）边缘未处理好，或引擎抗锯齿问题。|在 `[graphics]` 节添加 `imageScale: 1`；在 PS 等软件中给图片边缘添加 1 像素的透明羽化。|

### 3. `[movement]` 移动与寻路

|错误现象|原因分析|解决方案|
|:--|:--|:--|
|**单位原地鬼畜 / 无法移动**|`moveSpeed` 为 0，或 `movementType` 与地形不匹配（如陆地单位下水）。|检查 `moveSpeed: 1.5`。确保 `movementType: LAND`（陆地）、`WATER`（水面）、`AIR`（飞行）、`HOVER`（两栖悬浮）。|
|**单位卡死在障碍物上**|`movementType` 缺少 `IGNORES_ALL_COLLISION`（针对飞行），或碰撞体积 `footprint` 大于通道宽度。|飞行器必须加 `movementType: AIR`。如果是大型陆地单位，确保地图上的通道宽度大于其 `footprint`。|
|**转向极其缓慢 / 无法开火**|`turnSpeed` 或 `turnSpeedAcceleration` 设置过小。|炮塔转速和车体转速是分开计算的。检查 `turnSpeed: 0.05`（数值越大转得越快）。|

### 4. `[attack_X]` 武器系统

|错误现象|原因分析|解决方案|
|:--|:--|:--|
|**武器无法开火 / 没有弹道**|1. 未定义 `projectile`（抛射物）。2. `projectile` 引用的名字在 `[projectile_X]` 中不存在。|确保 `[attack_1]` 中有 `projectile: 1`，且文件中存在 `[projectile_1]` 节。|
|**只能打地 / 只能打空**|`targetGround` 或 `targetAir` 设置错误，或 `canAttack` 未开启。|必须明确写出 `canAttack: true`, `targetGround: true`, `targetAir: true`。|
|**射程显示异常 / 贴脸打**|`attackRange` 小于 `minAttackRange`，或数值填写了负数。|确保 `attackRange: 200`, `minAttackRange: 0`。|

---

## 三、 Action（触发器/动作）高阶逻辑错误（深水区）

`[action_X]` 和 `[hidden_action_X]` 是铁锈 MOD 的灵魂（用于实现技能、变形、生产、条件判断等），也是逻辑错误和死循环的重灾区。

|错误现象|错误代码 / 原因分析|正确写法 / 解决方案|
|:--|:--|:--|
|**条件判断永远不触发**|`requireConditional: hp > 50`_(铁锈不支持直接读取自身 hp 这种隐式变量，必须用系统函数)_|`requireConditional: self.hp > 50` 或 `self.hp(percentage) > 50`_(必须加 `self.` 前缀，且注意函数名是否正确)_|
|**逻辑运算符使用错误**|`requireConditional: self.hp == 100`_(浮点数/整数比较问题，或者用了单等号)_|建议使用范围判断：`requireConditional: self.hp > 99`_(铁锈的条件判断对 `==` 的支持有时很迷，尤其是涉及小数时，用 `>` 或 `<` 更稳妥)_|
|**Action 死循环 / 游戏卡死**|`[action_1]``autoTrigger: true``spawnUnit: myUnit`_(每帧都在生成单位，瞬间内存溢出)_|必须加冷却或条件限制！`autoTrigger: true``requireConditional: self.maxHp > 0` (且生成后改变条件)或使用 `cooldown: 5` (秒)。|
|**变量（Variable）无法传递**|`setVariable: myVar = 1`_(语法错误，铁锈的变量操作有专用关键字)_|`addResource: myVar=1` (设置/增加资源变量)`requireConditional: self.resource.myVar == 1` (读取变量)|
|**生成单位位置错误**|`spawnUnit: tank`_(默认在中心生成，如果体积大会卡住)_|使用偏移量：`spawnUnit: tank, x:0, y:20` 或者使用 `spawnEffects` 配合特效生成。|
|**玩家无法取消动作**|技能读条后无法打断。|添加 `canPlayerCancel: true`。|
|**隐藏动作不执行**|把 `autoTrigger` 写在了 `[hidden_action]` 里，但条件永远不满足，或者被其他 Action 覆盖。|检查 `autoTriggerConditions`，确保逻辑链完整。隐藏动作通常用于后台计算和状态切换。|

---

## 四、 抛射物（Projectile）与特效（Effect）错误

|错误现象|原因分析|解决方案|
|:--|:--|:--|
|**子弹没有伤害 / 伤害溢出**|`damage` 未定义，或 `areaDamage`（范围伤害）半径设置过大/过小。|确保 `[projectile_1]` 中有 `damage: 50`。如果是 AOE，检查 `areaDamage: 50` 和 `areaRadius: 30`。|
|**子弹穿墙 / 无法穿透**|`targetCollision` 或 `passThrough` 设置错误。|检查 `targetCollision: true`。如果需要穿透，使用 `passThrough: true` 并配合 `pierce`（穿透次数）。|
|**弹道轨迹（Trail）断裂**|`trailEffect` 引用的特效不存在，或 `trailEffectRate`（生成频率）过低。|检查 `trailEffect: 1` 是否对应了 `[effect_1]`，并调整 `trailEffectRate: 0.1`。|

---

## 五、 图形、音频与资源文件常见错误

|错误现象|产生原因|解决办法 / 排查建议|
|:--|:--|:--|
|**Missing Image / 贴图丢失**_(显示为黑块、白块或粉黑格子)_|1. `image:` 后面的路径或文件名拼写错误。2. 图片格式不是严格的 `.png`。3. 图片文件损坏或包含不支持的 Alpha 通道。|1. **严格区分大小写**：底层基于 Java/LibGDX，`Tank.PNG` 和 `tank.png` 在打包后会找不到文件，必须全小写或严格对应。2. 使用画图工具重新导出为标准的 PNG-24 或 PNG-8 格式。|
|**图片尺寸报错 / 动画帧错乱**|铁锈战争对贴图尺寸有一定要求，尤其是涉及动画帧（`total_frames`）切割时，图片总宽度不能被 `total_frames` 整除。|1. 确保单帧图片的长宽为**偶数**（最好是 2 的幂次方，如 32x32, 64x64）。2. 如果图片宽 192px，`total_frames: 6`（每帧 32px）是正确的；如果写 5 就会报错或显示撕裂错乱。|
|**单位被地形 / 树木遮挡**|`drawLayer` 层级设置错误。|地面单位通常设为 `drawLayer: units`，飞行单位设为 `drawLayer: air`，建筑设为 `drawLayer: buildings`。|
|**音效不播放 / 报错**|1. 音频格式不支持（使用了 MP3 或 WAV，但引擎更推荐 OGG）。2. 路径错误或文件名包含特殊字符。|将音效统一转换为 `.ogg` 格式，并确保文件名全英文、无空格、无特殊符号。|
|**特效 / 抛射物粒子不显示**|`[effect_X]` 或 `[projectile]` 中引用的粒子图片路径错误，或生命周期（`life`）设置为 0。|1. 检查特效图片路径（同样注意大小写和 `ROOT:` 前缀）。2. 确保 `life: 30`（帧数）和 `speed` 等数值大于 0。|
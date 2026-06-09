# 🛠 铁锈模组智能小帮手

[![VS Code](https://img.shields.io/badge/VS_Code-^1.85.0-blue)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Version](https://img.shields.io/badge/version-0.2.0-orange)

[English](README.en.md) | [中文](README.md)

> **铁锈战争 (Rusted Warfare) MOD 开发辅助工具** — VS Code 扩展。INI 智能补全、诊断检查、资源管理、格式化，一站式 MOD 开发 IDE 体验。自动适配 VS Code 语言（中文/English）。

---

## ✨ 功能

### 📝 智能补全

| 功能 | 说明 |
|------|------|
| 段落名补全 | 输入 `[` 触发，21 种 INI 段落全覆盖。多实例段落（如 `turret`/`action`/`effect`）自动提示带 `_NAME` 后缀 |
| 字段名补全 | 530+ 字段，按当前段落自动过滤。带类型（数字/布尔/枚举）、中文描述、示例值 |
| 枚举值补全 | 15 种枚举类型：`movementType`（LAND/HOVER/AIR…）、`drawLayer`、`teamColoringMode` 等 |
| 示例默认值 + Tab 跳转 | 选中字段自动填入示例值（如 `maxHp: 500`），按 Tab 跳到下一个编辑点 |
| 单位名补全 | 自动扫描工作区所有 `.ini` / `.template` 文件，在 `copyFrom` / `spawnUnits` / `builtFrom_*_name` 等引用字段中提示单位名 |
| 资源路径补全 | 在 `image:` / `sound:` / `icon:` 等字段中输入时，自动补全项目内的图片（png/jpg/webp）和音频（ogg/wav/mp3）路径，支持 `ROOT:` 前缀 |
| @memory 变量补全 | 识别 `@memory` 定义后，在 `memory.` 后或 `setUnitMemory:` / `updateUnitMemory:` 字段中提示已定义的变量名 |
| **完整数据覆盖** | 基于 1.15 版官方参数表：18 个 section 字段定义 + 15 种枚举值。支持秒单位（`buildSpeed: 3s`）、多资源（`price: credits=500, energy=10`）、LogicBoolean、模板变量等高级语法，不会误判为错误 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/智能补齐提示.png" alt="智能补全" width="600">

### 🎨 视觉辅助

| 功能 | 说明 |
|------|------|
| 语法高亮 | TextMate 语法，区分注释（`#`）、段落标题（`[section]`）、键值对、数字、布尔值、颜色值 |
| 颜色预览 + 调色板 | `#RRGGBB` / `#RRGGBBAA` / `#RGB` / `#RGBA` 行内显示色块，点击打开系统调色板选色 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/颜色预览.png" alt="颜色预览" width="600">

| 图片路径预览 | 悬停 `image:` / `icon:` 等路径时直接显示缩略图，支持相对路径和 `ROOT:` 路径 |
| 悬停字段说明 | 鼠标悬停在字段名上时显示字段的类型、描述和示例值 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/鼠标悬停解释.png" alt="鼠标悬停字段说明" width="600">

| 大纲视图 | Outline 面板显示所有段落和内部字段，字段按值类型标注图标（数字/布尔/文件/颜色） |
| 代码折叠 | 按 `[section]` 段落折叠/展开 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/缺少必要字段检测_大纲视图_代码块折叠.png" alt="悬停提示 + 大纲 + 必填检查" width="600">

### 🔍 诊断检查

| 功能 | 说明 |
|------|------|
| 重复字段检测 | 同段落内相同字段名首次出现标黄色背景，后续出现标红色波浪线 + 错误提示。`copyFrom` / `defineUnitMemory` / `spawnUnits` 等 11 个允许多次出现的字段自动跳过 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/重复字段检测.png" alt="重复字段检测" width="600">

| 资源路径检测 | `image:` / `sound:` / `icon:` 等字段的路径指向的文件不存在时实时 warning，支持相对路径和 `ROOT:` 前缀 |
| 资源路径 Quick Fix | 资源文件不存在时，自动扫描同目录和工作区的候选文件，一键替换 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/资源路径检测.png" alt="资源路径检测" width="600">  <img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/资源检测修复.png" alt="资源路径检测 + 修复" width="600">

| 单位引用检测 | `copyFrom` / `spawnUnits` / `builtFrom_*_name` 等字段引用的单位名在工作区中不存在时提示 warning |
| @memory 变量诊断 | 定义了但从未被引用的 `@memory` 变量标 warning 波浪线 |
| 必填字段检查（AI 守门员） | 检查 `[core]` 段是否缺少 `name` / `maxHp` / `price` / `mass` / `radius`，检查 `[movement]` 段是否缺少 `movementType` 等。已使用 `copyFrom` 的段落自动跳过 |

### 🔗 代码导航

| 功能 | 说明 |
|------|------|
| 跨文件引用跳转 | `copyFrom` / `spawnUnits` / `builtFrom_*_name` / `produceUnits` 等字段的值上 Ctrl+Click，直接跳转到目标单位的 `.ini` / `.template` 文件 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/跳转单位.png" alt="跨文件跳转" width="600">

| ini 文件格式对齐 | 右键 →「格式化 INI 文件」，按段落内最长键名对齐冒号。保留注释和空行，LogicBoolean 表达式和高级语法保持原样 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/INI文件格式对齐.png" alt="ini文件格式对齐" width="600">

| 自定义文件后缀 | 命令面板添加/移除 `.cfg` / `.conf` / `.unit` 等后缀关联到 `rusted-warfare` 语言，获得完整补全和诊断支持 |


---

## 🚀 快速开始

1. **安装扩展**（见下方）
2. **打开任意 `.ini` 文件** — 补全、格式化、诊断、大纲视图、颜色预览立刻生效，**无需任何配置**
3. **体验编辑辅助**：
   - 输入 `[` 触发段落名补全
   - 在段落内输入字段名，自动补全并填入示例值
   - 悬停字段查看文档说明
   - 点击 `#RRGGBB` 颜色值打开调色板
   - 右键选择「格式化 INI 文件」对齐代码

> 💡 所有编辑、诊断、格式化功能**开箱即用，不需要 API Key**。

---

## 📦 安装

### 从 VS Code 市场安装

> 暂无（未发布。注册发布商需要 Visa 卡验证身份，暂时无法完成）

### 从 VSIX 安装

```bash
npm install -g @vscode/vsce
vsce package
# VS Code → 扩展 → ... → 从 VSIX 安装
```

### 从源码运行

```bash
git clone <仓库地址>
cd RW-Mod-AI-helper
npm install
# VS Code → 运行 → 启动调试
```

---

## 📖 使用示例

```ini
# 输入 [ 触发段落名补全
[core]
# 在 [core] 下输入字段名，自动补全并填入示例值
name: myTank
maxHp: 500
price: 1000
mass: 300
radius: 16

[graphics]
# 输入 image: 后自动补全项目内的图片路径
image: myTank.png

[attack]
canAttack: true
canAttackFlyingUnits: true
canAttackLandUnits: true
# 输入枚举值时自动提示可选值
turretSize: 7

[movement]
movementType: LAND
moveSpeed: 1.0
```

---

## 🔧 配置

编辑和诊断功能**无需任何配置**。以下配置项仅用于可选的 AI 辅助功能：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `rwMod.aiProvider` | AI 服务商 | `openai` |
| `rwMod.aiModel` | 模型名称 | `gpt-4o` |
| `rwMod.aiEndpoint` | 自定义 API 端点 | `""` |
| `rwMod.knowledgeDir` | 知识库目录路径 | `""` |

---

### 🤖 AI 辅助功能（可选，半成品 🚧）

扩展附带侧边栏 AI 面板。如果你有 API Key，也可以用 AI 辅助 MOD 开发。**注意：AI 功能处于半成品阶段，并不完善，可能存在不稳定或不符合预期的行为。**

| 功能 | 说明 |
|------|------|
| 💬 AI 对话 | 侧边栏聊天，流式输出，支持 OpenAI / Anthropic / 自定义端点，结合内置知识库检索 |
| ✏️ AI 修改文件 | 描述需求 → AI 修改 → Diff 预览 → 确认/取消 |
| 🔫 AI 生成单位 | 描述需求 → AI 生成完整 INI 配置，一键插入/新建/复制 |
| 🧠 解释代码 | 选中 INI 片段右键 → AI 用通俗语言解释 |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/AI对话.png" alt="AI对话" width="600">  <img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/AI修改.png" alt="AI修改" width="600">

**内置知识库**（为 AI 提供参考）：132 个原版单位示例 + 官方参数参考 + 常见错误排查指南，支持 RAG 检索增强生成。

---

## 🧪 验证

```bash
npm run check
```

依次检查：命令注册一致性 → 知识库完整性 → TypeScript 编译。

---

## 🗺️ 项目结构

```
RW-Mod-AI-helper/
├── src/                    # TypeScript 源码
│   ├── extension.ts        # 扩展入口
│   ├── ai/                 # 补全/诊断/格式化 Provider
│   ├── panel/              # 侧边栏面板
│   ├── rag/                # 知识库
│   └── format/             # ini 文件格式对齐
├── assets/                 # WebView HTML + 图标
├── data/                   # 字段定义（18 section + 15 枚举）
├── knowledge/              # 内置知识库
├── syntaxes/               # TextMate 语法高亮
└── snippets/               # 代码片段
```

---

## 📄 许可

[MIT](LICENSE)

# 🛠 铁锈模组智能小帮手

[![VS Code](https://img.shields.io/badge/VS_Code-^1.85.0-blue)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green)](LICENSE)
![Version](https://img.shields.io/badge/version-0.3.0-orange)

[English](README.en.md) | [中文](README.md)

> **铁锈战争 (Rusted Warfare) MOD 开发辅助工具** — VS Code 扩展。提供 INI 智能补全、诊断检查、资源管理、本地工具和可选 AI 辅助，目标是把普通 MOD 编辑体验做成更接近 IDE 的工作流。

---

## 📖 文档

完整功能介绍文档整理中。后续会提供独立的功能文档网页，README 仅保留项目概览、安装方式和核心入口。

---

## ✨ 功能总览

| 分类 | 功能 |
|------|------|
| **智能补全** | 段落名补全、字段名补全、枚举值补全、示例默认值、Tab 跳转、单位名补全、资源路径补全、`@memory` 补全、自定义后缀补全 |
| **诊断检查** | 未知字段检测、中文冒号检测、字段放错段落、重复字段检测、资源路径检测、单位引用检测、`copyFrom` 文件不存在检测、`copyFrom` 未保存提示、`copyFrom` 缺后缀提醒、projectile/turret 引用检测、`@memory` 未使用检测、必填字段检查 |
| **快速修复** | 相似字段修复、大小写字段修复、资源路径修复、projectile/turret 引用修复、`copyFrom` 后缀提醒 |
| **代码导航** | 大纲视图、代码折叠、跨文件单位跳转、`copyFrom` 文件跳转、同文件 projectile/turret 跳转、书签跳转 |
| **视觉辅助** | 语法高亮、字段 Hover、枚举值 Hover、图片 Hover 缩放预览、颜色预览、调色板 |
| **资源管理** | 资源路径补全、资源路径校验、未使用资源检测、大 PNG 压缩建议、MOD 资源大小统计 |
| **本地工具** | Tools 快捷指令页、单位列表、MOD 体检概览、批量数值调整、安全重命名、导出 MOD 文档、属性书签、知识库目录选择 |
| **创建与模板** | 交互式单位创建向导、mod-info 生成器、内置单位模板、炮塔/弹道模板、生产建筑模板、代码片段 |
| **数值分析** | 数值平衡 Hover 参考、字段联想链、单位成本汇总、简化 DPS/TTK 战斗模拟 |
| **AI 辅助** | AI 对话、AI 生成单位、AI 修改文件、Explain Selection、AI 解析单位、代码块插入/新建/复制、RAG 知识库检索 |
| **国际化** | 中文/英文字段说明、诊断消息、WebView UI、AI 回复语言自适应 |

---

## 🖼️ 截图

> v0.3.0 截图持续整理中。当前已覆盖补全、资源诊断、Tools 快捷指令、copyFrom 诊断与 AI 对话等核心入口。

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/智能补齐提示.png" alt="智能补全" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/资源路径检测.png" alt="资源路径检测" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/Tools%20快捷指令页.png" alt="Tools 快捷指令页" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/copyfrom功能.png" alt="copyFrom 功能" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/AI对话.png" alt="AI 对话" width="600">

---

## 🚀 快速开始

1. 安装扩展。
2. 打开 `.ini` 或 `.template` 文件。
3. 输入 `[` 触发段落补全，在段落内输入字段名触发字段补全。
4. 悬停字段查看说明，观察诊断提示和 Quick Fix。
5. 打开侧边栏 `MOD助手`，在 `Tools` 页使用本地工具。
6. 可选：设置 API Key 后使用 AI 对话、生成单位、解释配置和修改文件。

> 💡 补全、诊断、格式化、资源管理和本地工具均可直接使用，不需要 API Key。
>
> ⚠️ AI 相关功能仍处于半成品/实验阶段，实际效果可能不稳定，也可能无法完全达到预期。建议把 AI 输出作为辅助参考，重要改动请自行确认。

---

## 📦 安装

### 从 VS Code 市场安装

> 暂无。当前建议从 Release 下载 VSIX，或从源码打包安装。

### 从 Release 下载 VSIX 安装

1. 打开 [GitHub Release 页面](https://github.com/NXD-1027/RW-Mod-AI-helper/releases)
2. 下载最新版本的 `.vsix` 文件
3. VS Code → 扩展 → `⋯` → 从 VSIX 安装 → 选择下载的文件
4. 安装完成后重新加载 VS Code

### 从源码打包安装

```bash
git clone git@github.com:NXD-1027/RW-Mod-AI-helper.git
cd RW-Mod-AI-helper
npm install
npm install -g @vscode/vsce
vsce package
```

然后在 VS Code 中选择“从 VSIX 安装”，安装生成的 `.vsix` 文件。

### 从源码运行

```bash
git clone git@github.com:NXD-1027/RW-Mod-AI-helper.git
cd RW-Mod-AI-helper
npm install
```

用 VS Code 打开项目文件夹，按 `F5` 启动扩展调试窗口。

---

## ⚙️ 配置

编辑和诊断功能无需配置。以下配置主要用于 AI 或自定义规则。AI 功能仍处于实验阶段，可能出现不稳定或不符合预期的结果。

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `rwMod.aiProvider` | AI 服务商 | `openai` |
| `rwMod.aiModel` | 模型名称 | `gpt-4o` |
| `rwMod.aiEndpoint` | 自定义 API 端点 | `""` |
| `rwMod.knowledgeDir` | 自定义知识库目录 | `""` |
| `rwMod.customRequiredFields` | 自定义必填字段规则 | `{}` |

---

## 🧪 验证

```bash
npm run check
```

该命令会依次执行：命令注册检查 → 知识库自检 → TypeScript 编译。

---

## 🗺️ 路线图

| 版本 | 方向 |
|------|------|
| v0.3.0 | 本地编辑增强：诊断、引用、资源、本地工具、copyFrom、模板和文档导出 |
| v0.4.0 | AI 增强：AI 批量平衡、AI 生成武器/弹头、版本日志草稿、多语言描述 |

---

## 📄 许可

从 v0.3.0 起，本项目使用 [GPL-3.0-only](LICENSE) 开源。

已经按 MIT 发布的 v0.2.0 及更早版本，仍按其原 MIT 许可证授权。

---

## 🤖 AI 驱动开发声明

本项目的大部分代码、文档和功能设计由 AI 辅助生成。从项目初始化、功能实现、Bug 修复、国际化适配到文档整理，AI 都参与了开发过程。

# 🛠 RW-Mod-AI-helper

[![VS Code](https://img.shields.io/badge/VS_Code-^1.85.0-blue)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Version](https://img.shields.io/badge/version-0.2.0-orange)

[中文](README.md) | [English](README.en.md)

> **Rusted Warfare Mod Development Assistant** — A VS Code extension providing INI completion, diagnostics, resource management, formatting, and more — an IDE-grade modding experience. Auto-adapts to your VS Code language (English/中文).

---

## ✨ Features

### 📝 Smart Completion

| Feature | Description |
|---------|-------------|
| Section Completion | Type `[` to trigger. All 21 INI section types. Multi-instance sections (turret/action/effect) auto-suggest `_NAME` suffix |
| Field Completion | 530+ fields filtered by current section, with type, descriptions, and example values |
| Enum Completion | 15 enum types: `movementType` (LAND/HOVER/AIR…), `drawLayer`, `teamColoringMode`, and more |
| Default Values + Tab Stops | Auto-fills example values (e.g. `maxHp: 500`), Tab to jump to next edit point |
| Unit Name Completion | Scans workspace `.ini` / `.template` files, provides unit names in `copyFrom` / `spawnUnits` / `builtFrom_*_name` fields |
| Resource Path Completion | Auto-completes image and audio paths in `image:` / `sound:` / `icon:` fields. Supports `ROOT:` prefix |
| @memory Variable Completion | After `@memory` definitions, suggests variable names after `memory.` and in memory fields |
| **Complete Data Coverage** | Built from v1.15 official parameter table: 18 section field definitions + 15 enum types. Supports time units, multi-resource, LogicBoolean, template variables |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/智能补齐提示.png" alt="Smart Completion" width="600">

### 🎨 Visual Aids

| Feature | Description |
|---------|-------------|
| Syntax Highlighting | TextMate grammar: comments, sections, key-values, numbers, booleans, color values |
| Color Preview + Picker | `#RRGGBB` / `#RRGGBBAA` / `#RGB` / `#RGBA` — inline color swatches, click to open system color picker |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/颜色预览.png" alt="Color Preview" width="600">

| Hover Info | Shows field type, description and example value on mouse hover |
| Image Preview | Hover over `image:` / `icon:` paths to see thumbnails. Supports relative paths and `ROOT:` prefix |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/鼠标悬停解释.png" alt="Hover Documentation" width="600">

| Outline View | Shows all sections and their fields with type-specific icons |
| Code Folding | Fold/unfold by `[section]` blocks |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/缺少必要字段检测_大纲视图_代码块折叠.png" alt="Outline + Code Folding" width="600">

### 🔍 Diagnostics

| Feature | Description |
|---------|-------------|
| Duplicate Detection | First occurrence gets yellow background, subsequent ones get red wavy underline. Auto-skips 11 multi-use fields |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/重复字段检测.png" alt="Duplicate Detection" width="600">

| Resource Path Check | Real-time warnings when image/sound/icon paths point to non-existent files |
| Resource Quick Fix | Scans the same directory and workspace for candidate files, offers one-click replacement |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/资源路径检测.png" alt="Resource Path Check" width="600">  <img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/资源检测修复.png" alt="Resource Diagnostics + Quick Fix" width="600">

| Unit Reference Check | Warns when referenced unit names don't exist |
| @memory Diagnostics | Warns on defined but unused memory variables |
| Required Field Check (AI Guardian) | Checks required fields (name, maxHp, price, mass, radius, etc.) |

### 🔗 Code Navigation

| Feature | Description |
|---------|-------------|
| Cross-file Jump | Ctrl+Click on copyFrom/spawnUnits/builtFrom_*_name to jump to target file |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/跳转单位.png" alt="Cross-file Jump" width="600">

| INI Formatting | Right-click → "Format INI File". Aligns colons, preserves comments and advanced syntax |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/INI文件格式对齐.png" alt="INI Format Alignment" width="600">

| Custom File Extensions | Add/remove `.cfg` / `.conf` / `.unit` associations to `rusted-warfare` |

---

## 🚀 Quick Start

1. **Install the extension** (see below)
2. **Open any `.ini` file** — completion, formatting, diagnostics, outline, color preview work immediately, **zero configuration required**
3. **Try it out**:
   - Type `[` to trigger section completion
   - Type field names with auto-filled example values
   - Hover over fields for documentation
   - Click `#RRGGBB` colors to open the picker
   - Right-click → "Format INI File" to align code

> 💡 All editing, diagnostics, and formatting features **work out of the box, no API key required**.

---

## 📦 Installation

### From VS Code Marketplace

> Not yet (publisher registration requires a Visa card for identity verification)

### Option 1: Download VSIX from Release

1. Go to the [GitHub Releases page](https://github.com/NXD-1027/RW-Mod-AI-helper/releases)
2. Download the latest `.vsix` file
3. VS Code → Extensions → `⋯` → Install from VSIX → select the downloaded file
4. Click **Reload** to activate

### Option 2: Package from Source

```bash
# 1. Clone the repository
git clone git@github.com:NXD-1027/RW-Mod-AI-helper.git
cd RW-Mod-AI-helper

# 2. Install dependencies
npm install

# 3. Install packaging tool and build
npm install -g @vscode/vsce
vsce package

# 4. VS Code → Extensions → ⋯ → Install from VSIX → select the .vsix file
```

### Option 3: Run from Source (Development)

```bash
git clone git@github.com:NXD-1027/RW-Mod-AI-helper.git
cd RW-Mod-AI-helper
npm install
# Open the project folder in VS Code and press F5 to start debugging
```

---

## 📖 Example

```ini
# Type [ to trigger section completion
[core]
# Fields with auto-fill examples
name: myTank
maxHp: 500
price: 1000
mass: 300
radius: 16

[graphics]
# Resource path auto-completion in image: fields
image: myTank.png

[attack]
canAttack: true
canAttackFlyingUnits: true
canAttackLandUnits: true
# Enum values auto-suggested
turretSize: 7

[movement]
movementType: LAND
moveSpeed: 1.0
```

---

## 🔧 Configuration

Editing and diagnostics require **no configuration**. The following settings are only for optional AI features:

| Setting | Description | Default |
|---------|-------------|---------|
| `rwMod.aiProvider` | AI provider | `openai` |
| `rwMod.aiModel` | Model name | `gpt-4o` |
| `rwMod.aiEndpoint` | Custom API endpoint | `""` |
| `rwMod.knowledgeDir` | Knowledge directory path | `""` |

---

### 🤖 AI Features (Optional, Work in Progress 🚧)

The extension includes a sidebar AI panel. If you have an API key. **Note: AI features are a work in progress and may be unstable or behave unexpectedly.**

| Feature | Description |
|---------|-------------|
| 💬 AI Chat | Sidebar chat with streaming output, OpenAI / Anthropic / custom endpoints, RAG knowledge base |
| ✏️ AI Modify | Describe changes → AI edits → Diff preview → confirm/cancel |
| 🔫 AI Generate | Describe a unit → AI generates complete INI config with one-click actions |
| 🧠 Explain | Select INI → right-click → AI explains |

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/AI对话.png" alt="AI Chat" width="600">  <img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/AI修改.png" alt="AI Modify" width="600">

**Built-in Knowledge Base** (provides context for AI): 132 vanilla unit examples + official parameter reference + troubleshooting guide, with RAG retrieval-augmented generation.

---

## 🧪 Verify

```bash
npm run check
```

Checks: command registration → knowledge base integrity → TypeScript compilation.

---

## 🗺️ Project Structure

```
RW-Mod-AI-helper/
├── src/                    # TypeScript source
│   ├── extension.ts        # Entry point
│   ├── ai/                 # Completion/diagnostic/formatting providers
│   ├── panel/              # Sidebar panel
│   ├── rag/                # Knowledge base
│   └── format/             # INI formatter
├── assets/                 # WebView HTML + icons
├── data/                   # Field definitions (18 sections + 15 enums)
├── knowledge/              # Built-in knowledge base
├── syntaxes/               # TextMate grammar
└── snippets/               # Code snippets
```

---

## 📄 License

[MIT](LICENSE)

---

### 🤖 AI-Driven Development

The vast majority of this project's code, documentation, and feature design were generated by AI. From project initialization and feature implementation to bug fixing, internationalization, and documentation — AI was involved throughout every stage of development.

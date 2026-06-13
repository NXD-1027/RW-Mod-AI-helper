# 🛠 RW-Mod-AI-helper

[![VS Code](https://img.shields.io/badge/VS_Code-^1.85.0-blue)](https://code.visualstudio.com)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green)](LICENSE)
![Version](https://img.shields.io/badge/version-0.3.0-orange)

[中文](README.md) | [English](README.en.md)

> **Rusted Warfare Mod Development Assistant** — a VS Code extension for INI completion, diagnostics, resource management, local tools, and optional AI assistance. The goal is to make Rusted Warfare mod editing feel closer to an IDE workflow.

---

## 📖 Documentation

The full feature guide is being organized. A dedicated documentation site will be added later; this README keeps only the project overview, installation steps, and core entry points.

---

## ✨ Feature Overview

| Category | Features |
|----------|----------|
| **Smart Completion** | Section completion, field completion, enum completion, default values, Tab stops, unit name completion, resource path completion, `@memory` completion, custom extension completion |
| **Diagnostics** | Unknown fields, Chinese colon checks, wrong-section fields, duplicate fields, resource path checks, unit reference checks, `copyFrom` missing-file checks, dirty `copyFrom` target warnings, `copyFrom` extension hints, projectile/turret reference checks, unused `@memory` diagnostics, required field checks |
| **Quick Fixes** | Similar field fixes, field casing fixes, resource path fixes, projectile/turret reference fixes, `copyFrom` extension hints |
| **Navigation** | Outline view, code folding, cross-file unit jumps, `copyFrom` file jumps, same-file projectile/turret jumps, bookmark jumps |
| **Visual Aids** | Syntax highlighting, field hover docs, enum value hover docs, scaled image hover preview, color preview, color picker |
| **Resource Management** | Resource path completion, resource path validation, unused resource scan, large PNG compression hints, MOD resource size statistics |
| **Local Tools** | Tools tab, unit list, MOD overview report, bulk balance adjustment, safe rename, MOD docs export, property bookmarks, knowledge directory selection |
| **Creation & Templates** | Unit wizard, mod-info generator, built-in unit templates, turret/projectile templates, production building templates, snippets |
| **Balance & Analysis** | Vanilla stat hover references, related field chains, unit cost summaries, simplified DPS/TTK battle simulation |
| **AI Assistance** | AI chat, AI unit generation, AI file modification, Explain Selection, AI unit analysis, code block insert/new-file/copy actions, RAG knowledge retrieval |
| **Internationalization** | Chinese/English field docs, diagnostics, WebView UI, AI response language adaptation |

---

## 🖼️ Screenshots

> v0.3.0 screenshots are still being organized. Current screenshots cover completion, resource diagnostics, the Tools tab, copyFrom diagnostics, and AI chat.

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/智能补齐提示.png" alt="Smart Completion" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/资源路径检测.png" alt="Resource Diagnostics" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/Tools%20快捷指令页.png" alt="Tools Tab" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/copyfrom功能.png" alt="copyFrom Diagnostics" width="600">

<img src="https://raw.githubusercontent.com/NXD-1027/RW-Mod-AI-helper/master/images/AI对话.png" alt="AI Chat" width="600">

---

## 🚀 Quick Start

1. Install the extension.
2. Open a `.ini` or `.template` file.
3. Type `[` for section completion, or type field names inside a section for field completion.
4. Hover over fields for docs, then use diagnostics and Quick Fixes while editing.
5. Open the `MOD助手` sidebar and use the `Tools` tab for local tools.
6. Optional: configure an API key to use AI chat, unit generation, config explanation, and AI file modification.

> 💡 Completion, diagnostics, formatting, resource management, and local tools work without an API key.
>
> ⚠️ AI features are still experimental and may be unstable or fail to meet expectations. Treat AI output as assistance, and review important changes yourself.

---

## 📦 Installation

### From VS Code Marketplace

> Not available yet. For now, install from a VSIX release or package from source.

### Install VSIX From Release

1. Open the [GitHub Releases page](https://github.com/NXD-1027/RW-Mod-AI-helper/releases)
2. Download the latest `.vsix` file
3. VS Code → Extensions → `⋯` → Install from VSIX → select the downloaded file
4. Reload VS Code after installation

### Package From Source

```bash
git clone git@github.com:NXD-1027/RW-Mod-AI-helper.git
cd RW-Mod-AI-helper
npm install
npm install -g @vscode/vsce
vsce package
```

Then install the generated `.vsix` file from VS Code.

### Run From Source

```bash
git clone git@github.com:NXD-1027/RW-Mod-AI-helper.git
cd RW-Mod-AI-helper
npm install
```

Open the project folder in VS Code and press `F5` to start an Extension Development Host.

---

## ⚙️ Configuration

Editing and diagnostics require no configuration. The following settings are mainly for AI features or custom rules. AI features are still experimental and may produce unstable or unexpected results.

| Setting | Description | Default |
|---------|-------------|---------|
| `rwMod.aiProvider` | AI provider | `openai` |
| `rwMod.aiModel` | Model name | `gpt-4o` |
| `rwMod.aiEndpoint` | Custom API endpoint | `""` |
| `rwMod.knowledgeDir` | Custom knowledge directory | `""` |
| `rwMod.customRequiredFields` | Custom required field rules | `{}` |

---

## 🧪 Verify

```bash
npm run check
```

This runs: command registration check → knowledge self-check → TypeScript compilation.

---

## 🗺️ Roadmap

| Version | Focus |
|---------|-------|
| v0.3.0 | Local editing: diagnostics, references, resources, local tools, copyFrom, templates, docs export |
| v0.4.0 | AI enhancements: AI balance adjustment, AI weapon/projectile generation, changelog drafts, multilingual descriptions |

---

## 📄 License

Starting with v0.3.0, this project is licensed under [GPL-3.0-only](LICENSE).

Previously released v0.2.0 and earlier versions remain available under their original MIT license.

---

## 🤖 AI-Driven Development

Most of this project's code, documentation, and feature design were generated with AI assistance. AI has been involved in project initialization, feature implementation, bug fixing, internationalization, and documentation cleanup.

# Danucode

[![CI](https://github.com/zabarich/danucode/actions/workflows/ci.yml/badge.svg)](https://github.com/zabarich/danucode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen)](https://nodejs.org)

The simplest agent shell for your own models.

An agentic coding tool for your terminal where nothing leaves your network. For developers running Ollama, llama.cpp, vLLM, or any OpenAI-compatible endpoint who want the Claude Code workflow without vendor lock-in, cloud accounts, or subscriptions. For security-conscious teams, regulated industries, or anyone who just wants their code to stay on their machine.

Three fields in a config file and you're running:

```json
{
  "base_url": "http://localhost:11434/v1",
  "api_key": "ollama",
  "model": "qwen2.5-coder:32b"
}
```

> **Status:** Experimental framework, not a production tool. Works for real tasks with capable models, but lacks the polish and battle-testing of Aider, Claude Code, or Codex CLI. Use it to learn, tinker, and build on.

**(c) Danucore** | [Security Model](SECURITY.md) | [Changelog](CHANGELOG.md) | [Demos](docs/demos/)

## Why This Exists

The mature coding agents are excellent but opinionated:
- **Claude Code** — Claude-only, requires Anthropic subscription
- **Codex CLI** — OpenAI-only, Rust, heavier setup
- **Aider** — Python, large dependency tree, opinionated git workflow

If you're already running a local model and want something lighter — a transparent tool-calling loop you can read, modify, and point at any backend — that's what Danucode is.

**What it does better than the alternatives:** zero-config local setup. No account, no cloud, no subscription. Point it at your inference server and go.

**What the alternatives do better than it:** everything else. They have years of development, millions of users, real sandboxing, extensive test suites, and production hardening. Danucode has ~4,000 lines of JavaScript and one afternoon of development.

## Quick Start

```bash
git clone https://github.com/zabarich/danucode.git
cd danucode
npm install
npm link       # installs 'danu' as a global command
```

Create `~/.danu/config.json`:

```json
{
  "base_url": "http://localhost:11434/v1",
  "api_key": "ollama",
  "model": "qwen2.5-coder:32b"
}
```

Then from any project directory:

```bash
danu                              # interactive
danu --yolo                       # skip permission prompts
danu -c "fix the bug in main.js"  # one-shot
danu --session myproject           # persistent session
danu doctor                        # check your setup
```

## How It Works

Danucode runs the same loop as every agentic coding tool:

1. You type a message
2. It sends your message + tool definitions to the LLM
3. The LLM responds with text or tool calls (e.g., "read this file", "run this command")
4. Danucode executes the tools locally and sends results back
5. Repeat until the LLM responds with just text

That's it. The rest is scaffolding: which tools exist, how permissions work, how context is managed.

## Configuration

Danucode loads config from (in order, later overrides earlier):
1. `~/.danu/config.json` (user-level)
2. `./danu.config.json` (project-level)
3. `--config <path>` (CLI override)

See `danu.config.example.json` for all options including search provider, timeout, and context limits.

### Example Configs

**Ollama:**
```json
{ "base_url": "http://localhost:11434/v1", "api_key": "ollama", "model": "qwen2.5-coder:32b" }
```

**llama.cpp:**
```json
{ "base_url": "http://localhost:8080/v1", "api_key": "none", "model": "my-model.gguf" }
```

**vLLM:**
```json
{ "base_url": "http://localhost:8000/v1", "api_key": "token", "model": "Qwen/Qwen2.5-32B" }
```

**OpenAI (remote):**
```json
{ "base_url": "https://api.openai.com/v1", "api_key": "sk-...", "model": "gpt-4o" }
```

## What You Get

**Tools:** Bash, Read, Write, Edit, Grep, Glob, Patch, Agent (sub-agents), WebSearch, WebFetch, GitHub, LSP, NotebookEdit, Tasks

**Modes:** `/mode code` (full access), `/mode architect` (read-only + markdown), `/mode ask` (read-only), `/mode debug` (full access, diagnostic prompt)

**Plan mode:** `/plan` to explore and design before implementing. Restricts to read-only tools until you approve the plan.

**Project context:** Create a `DANUCODE.md` in your project root (`/init` generates one). Danucode reads it into the system prompt.

**Memory:** `/memory save "user prefers TypeScript"` — persists across sessions in `~/.danu/memory/`.

**Sessions:** `danu --session myproject` auto-saves and resumes. `/save`, `/resume`, `/history` for manual control.

**Permissions:** Tools that modify files or run commands ask `y/n/a(lways)` before executing. `--yolo` or `/yolo` to bypass.

**Hooks:** Configure pre/post tool execution commands in your config.

**Extensibility:** MCP servers, custom tools in `.danu/tools/`, configurable search providers.

## Commands

`/help` `/init` `/plan` `/mode` `/model` `/yolo` `/undo` `/redo` `/compact` `/save` `/resume` `/history` `/memory` `/pr` `/exit`

## Testing

```bash
npm test    # 25 tests covering tools, permissions, context management
```

CI runs on Node 20/22 across Linux, Windows, and macOS.

## Security

Danucode gives an LLM shell access and file modification abilities on your machine. Read [SECURITY.md](SECURITY.md) before running with `--yolo`.

Key points: permission prompts by default, `.danuignore` for sensitive files, mode-based restrictions, no telemetry.

## Requirements

- Node.js >= 20
- An OpenAI-compatible API endpoint with tool/function calling support

## License

MIT. (c) Danucore.

# Changelog

## v0.1.0 (2026-03-28)

Initial release.

### Core
- OpenAI-compatible API client with streaming (SSE) support
- Conversation loop with tool calling (function calling protocol)
- Configurable context limits with 2-stage compaction (prune tool outputs, then summarise)
- Multi-level config: `~/.danu/config.json` → `./danu.config.json` → `--config`

### Tools (15 built-in)
- **Bash** — shell execution with Windows Git Bash detection
- **Read** — file reading with line numbers, offset/limit
- **Write** — file creation with mkdir -p, overwrite detection
- **Edit** — find-and-replace with uniqueness enforcement, colored diffs
- **Grep** — regex search with ripgrep or JS fallback
- **Glob** — file pattern matching sorted by mtime
- **Patch** — unified diff application
- **Agent** — sub-agent spawning with optional git worktree isolation
- **WebSearch** — DuckDuckGo (default), Brave, SearXNG
- **WebFetch** — URL fetching with HTML-to-text conversion
- **NotebookEdit** — Jupyter cell replace/insert/delete
- **GitHub** — PR/issue operations via `gh` CLI
- **LSP** — language server integration (definition, references, hover)
- **TaskCreate/Update/List** — in-session task tracking

### Extensibility
- **MCP Integration** — stdio-based Model Context Protocol servers
- **Custom tools directory** — `.danu/tools/` and `~/.danu/tools/`
- **Hook system** — pre/post tool execution hooks via config

### Modes
- **code** — full access (default)
- **architect** — read-only + markdown writing
- **ask** — read-only, no modifications
- **debug** — full access with debugging-focused prompt

### Commands (18)
`/help`, `/init`, `/plan`, `/mode`, `/model`, `/yolo`, `/undo`, `/redo`,
`/compact`, `/save`, `/resume`, `/history`, `/memory` (save/list/forget/clear),
`/pr`, `/exit`

### CLI
- `danu` — interactive TUI (Ink/React when TTY, readline fallback)
- `danu --yolo` — skip all permission prompts
- `danu -c "command"` — one-shot mode
- `danu --session name` — persistent named sessions with auto-save
- `danu --model name` — override model
- `danu doctor` — system diagnostics
- `danu --version`

### UI
- Ink/React TUI with fixed status bar and input area
- Spinner with NZ-themed phrases and Esc-to-cancel hint
- Colored diffs on Edit, before/after line counts on Write
- Markdown inline rendering (bold, italic, code, links)
- Tool call indicators (● start, ✓ success, ✗ failure)

### Security
- Permission system: y/n/a(lways) per tool
- `.danuignore` for excluding sensitive files
- Plan mode restricts to read-only tools
- Mode-based tool access restrictions
- No telemetry, no data sent except to configured LLM endpoint

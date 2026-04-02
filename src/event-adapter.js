// Danucode Event Adapter
// Bridges loop.js emit() calls to structured DanuEvent objects
// for the WebSocket-based console UI.

// ─── Dangerous / Safe bash patterns ─────────────────────────

const DANGEROUS_BASH_PATTERNS = [
  /\brm\s+(-[rRf]+\s+|.*--no-preserve-root)/,
  /\brm\s+-[^\s]*r/,
  /\bgit\s+reset\s+--hard/,
  /\bgit\s+push\s+--force/,
  /\bgit\s+push\s+-f\b/,
  /\bgit\s+clean\s+-[^\s]*f/,
  /\bgit\s+checkout\s+--\s/,
  /\bgit\s+branch\s+-D\b/,
  /\bchmod\s+777\b/,
  /\bchown\s+-R\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  />\s*\/dev\/sd[a-z]/,
  /\bcurl\s.*\|\s*(bash|sh)\b/,
  /\bwget\s.*\|\s*(bash|sh)\b/,
  /\beval\s/,
  /\bnpm\s+publish\b/,
  /\bdrop\s+database\b/i,
  /\bdrop\s+table\b/i,
  /\btruncate\s+table\b/i,
];

const SAFE_BASH_PATTERNS = [
  /^\s*ls\b/,
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*echo\b/,
  /^\s*pwd\b/,
  /^\s*which\b/,
  /^\s*where\b/,
  /^\s*whoami\b/,
  /^\s*date\b/,
  /^\s*git\s+(status|log|diff|branch|show|remote|tag)\b/,
  /^\s*git\s+rev-parse\b/,
  /^\s*node\s+--version/,
  /^\s*npm\s+(ls|list|test|run|version)\b/,
  /^\s*wc\b/,
  /^\s*find\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
  /^\s*type\b/,
  /^\s*dir\b/,
];

export function classifyBashRisk(command) {
  if (!command) return 'safe';
  for (const pat of DANGEROUS_BASH_PATTERNS) {
    if (pat.test(command)) return 'danger';
  }
  for (const pat of SAFE_BASH_PATTERNS) {
    if (pat.test(command)) return 'safe';
  }
  return 'caution';
}

// ─── Tool risk / category maps ──────────────────────────────

const TOOL_RISK = {
  Read: 'safe',
  Grep: 'safe',
  Glob: 'safe',
  WebSearch: 'safe',
  WebFetch: 'safe',
  Agent: 'safe',
  TaskCreate: 'safe',
  TaskUpdate: 'safe',
  TaskList: 'safe',
  Write: 'caution',
  Edit: 'caution',
  Patch: 'caution',
  Bash: 'caution',
  SendMessage: 'safe',
};

const TOOL_CATEGORY = {
  Read: 'read',
  Grep: 'search',
  Glob: 'search',
  WebSearch: 'search',
  WebFetch: 'search',
  Agent: 'search',
  Write: 'edit',
  Edit: 'edit',
  Patch: 'edit',
  Bash: 'shell',
  TaskCreate: 'response',
  TaskUpdate: 'response',
  TaskList: 'response',
  SendMessage: 'response',
};

export function classifyToolRisk(toolName, args) {
  if (toolName === 'Bash') {
    return classifyBashRisk(args?.command);
  }
  return TOOL_RISK[toolName] || 'caution';
}

export function getToolCategory(toolName) {
  return TOOL_CATEGORY[toolName] || 'response';
}

// ─── Listener registry ──────────────────────────────────────

const listeners = [];

export function addListener(fn) {
  listeners.push(fn);
}

export function removeAllListeners() {
  listeners.length = 0;
}

function broadcast(event) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      // listener errors must not break the pipeline
    }
  }
}

// ─── Helper: truncate ───────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

// ─── Helper: tool detail string ─────────────────────────────

export function getToolDetailString(name, args) {
  switch (name) {
    case 'Bash': return args?.command || '';
    case 'Read': return args?.file_path || '';
    case 'Write': return args?.file_path || '';
    case 'Edit': return args?.file_path || '';
    case 'Grep': return args?.pattern || '';
    case 'Glob': return args?.pattern || '';
    case 'Agent': return args?.description || args?.prompt?.slice(0, 60) || '';
    case 'SendMessage': return args?.to ? `-> ${args.to}` : '';
    case 'WebSearch': return args?.query || '';
    case 'WebFetch': return args?.url || '';
    default: return '';
  }
}

// ─── Helper: extract metadata ───────────────────────────────

export function extractMeta(toolName, args) {
  const meta = {};
  if (toolName === 'Edit' && args) {
    if (args.old_string) {
      meta.has_diff = true;
      meta.old_string = truncate(args.old_string, 500);
      meta.new_string = truncate(args.new_string || '', 500);
    }
    if (args.start_line) meta.start_line = args.start_line;
    if (args.end_line) meta.end_line = args.end_line;
  }
  if (toolName === 'Read' && args) {
    if (args.offset) meta.start_line = args.offset;
    if (args.offset && args.limit) meta.end_line = args.offset + args.limit;
  }
  if (toolName === 'Write' && args) {
    if (args.file_path) meta.file_path = args.file_path;
  }
  return meta;
}

// ─── Emit functions ─────────────────────────────────────────

export function emitToolStart(tabId, toolName, args) {
  broadcast({
    type: 'tool-start',
    tabId,
    tool: toolName,
    detail: getToolDetailString(toolName, args),
    risk: classifyToolRisk(toolName, args),
    category: getToolCategory(toolName),
    meta: extractMeta(toolName, args),
    timestamp: new Date().toISOString(),
  });
}

export function emitToolOutput(tabId, content, totalLines) {
  broadcast({
    type: 'tool-output',
    tabId,
    content: truncate(content, 2000),
    totalLines: totalLines || 0,
    category: 'response',
    timestamp: new Date().toISOString(),
  });
}

export function emitToolDone(tabId, success, summary) {
  broadcast({
    type: 'tool-done',
    tabId,
    success,
    summary: summary || '',
    category: 'response',
    timestamp: new Date().toISOString(),
  });
}

export function emitText(tabId, content) {
  broadcast({
    type: 'text',
    tabId,
    content,
    category: 'response',
    timestamp: new Date().toISOString(),
  });
}

export function emitTextDone(tabId) {
  broadcast({
    type: 'text-done',
    tabId,
    category: 'response',
    timestamp: new Date().toISOString(),
  });
}

export function emitTaskUpdate(tabId, tasks, completed, total) {
  broadcast({
    type: 'task-update',
    tabId,
    tasks,
    completed,
    total,
    category: 'response',
    timestamp: new Date().toISOString(),
  });
}

export function emitThinking(tabId, elapsed, phrase) {
  broadcast({
    type: 'thinking',
    tabId,
    elapsed,
    phrase: phrase || 'Thinking...',
    category: 'response',
    timestamp: new Date().toISOString(),
  });
}

export function emitInterrupted(tabId, reason) {
  broadcast({
    type: 'interrupted',
    tabId,
    reason: reason || 'User interrupted',
    category: 'status',
    timestamp: new Date().toISOString(),
  });
}

export function emitError(tabId, message) {
  broadcast({
    type: 'error',
    tabId,
    message,
    category: 'warning',
    timestamp: new Date().toISOString(),
  });
}

export function emitStatus(tabId, statusData) {
  broadcast({
    type: 'status',
    tabId,
    ...statusData,
    category: 'status',
    timestamp: new Date().toISOString(),
  });
}

// ─── Legacy emitter (backward compat) ──────────────────────

export function createLegacyEmitter(tabId) {
  return function legacyEmit(type, content) {
    switch (type) {
      case 'tool-start':
        emitToolStart(tabId, 'unknown', {});
        break;
      case 'tool-output':
        emitToolOutput(tabId, content, 0);
        break;
      case 'tool-done':
        emitToolDone(tabId, content === '\u2713', content);
        break;
      case 'text':
        emitText(tabId, content);
        break;
      case 'error':
        emitError(tabId, content);
        break;
      case 'system':
        emitStatus(tabId, { message: content });
        break;
      default:
        emitText(tabId, content);
        break;
    }
  };
}

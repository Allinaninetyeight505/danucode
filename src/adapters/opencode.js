// OpenCode Adapter
// Wraps the `opencode` CLI as a subprocess with ANSI text parsing.

import { spawn, execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import {
  emitToolStart, emitToolOutput, emitToolDone,
  emitText, emitTextDone, emitError,
} from '../event-adapter.js';

// Resolve opencode binary path at import time
let opencodeBinary = 'opencode';
try {
  const result = execSync('where opencode', { stdio: 'pipe', encoding: 'utf-8' }).trim();
  const lines = result.split(/\r?\n/);
  if (lines.length > 0 && lines[0]) {
    opencodeBinary = lines[0].trim();
  }
} catch {
  const candidates = [
    resolve(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
    '/usr/local/bin/opencode',
    '/usr/bin/opencode',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      opencodeBinary = p;
      break;
    }
  }
}

// Strip ANSI escape sequences
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

// Tool activity detection patterns
const TOOL_PATTERNS = [
  { pattern: /^←\s+Write\s+(.+)$/i, type: 'start', tool: 'Write' },
  { pattern: /^←\s+Read\s+(.+)$/i, type: 'start', tool: 'Read' },
  { pattern: /^←\s+Edit\s+(.+)$/i, type: 'start', tool: 'Edit' },
  { pattern: /^←\s+Bash\s+(.+)$/i, type: 'start', tool: 'Bash' },
  { pattern: /^←\s+Grep\s+(.+)$/i, type: 'start', tool: 'Grep' },
  { pattern: /^←\s+Glob\s+(.+)$/i, type: 'start', tool: 'Glob' },
  { pattern: /^✓\s+(.*)$/i, type: 'done-success' },
  { pattern: /^✗\s+(.*)$/i, type: 'done-failure' },
  { pattern: /^→\s+(.+)$/i, type: 'output' },
  { pattern: /^#\s+(.+)$/i, type: 'heading' },
];

export const meta = {
  id: 'opencode',
  name: 'OpenCode',
  supervision: 'standard',
  description: 'OpenCode CLI agent with standard supervision.',
};

export function createSession(tabId, cwd, config) {
  return {
    id: tabId,
    backend: 'opencode',
    supervision: 'standard',
    cwd,
    model: config?.model || '',
    process: null,
    busy: false,
    tokenEstimate: 0,
    currentTool: null,
    lastModel: '',
  };
}

export async function sendMessage(session, message) {
  return new Promise((resolveMsg, rejectMsg) => {
    const tabId = session.id;
    const args = [message];

    if (session.model) {
      args.unshift('--model', session.model);
    }

    session.busy = true;
    session.currentTool = null;

    const child = spawn(opencodeBinary, args, {
      cwd: session.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env },
    });

    session.process = child;

    let stdoutBuffer = '';

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const rawLine of lines) {
        parseLine(session, tabId, rawLine);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        emitError(tabId, text);
      }
    });

    child.on('close', (code) => {
      session.process = null;
      session.busy = false;
      // Flush remaining buffer
      if (stdoutBuffer.trim()) {
        parseLine(session, tabId, stdoutBuffer);
      }
      // Close any open tool
      if (session.currentTool) {
        emitToolDone(tabId, true, '');
        session.currentTool = null;
      }
      emitTextDone(tabId);
      if (code !== 0 && code !== null) {
        emitError(tabId, `OpenCode process exited with code ${code}`);
      }
      resolveMsg();
    });

    child.on('error', (err) => {
      session.process = null;
      session.busy = false;
      emitError(tabId, `Failed to spawn opencode: ${err.message}`);
      rejectMsg(err);
    });
  });
}

function parseLine(session, tabId, rawLine) {
  const clean = stripAnsi(rawLine).trim();
  if (!clean) return;

  for (const tp of TOOL_PATTERNS) {
    const match = clean.match(tp.pattern);
    if (!match) continue;

    switch (tp.type) {
      case 'start': {
        // Close any previously open tool
        if (session.currentTool) {
          emitToolDone(tabId, true, '');
        }
        session.currentTool = tp.tool;
        const detail = match[1] || '';
        emitToolStart(tabId, tp.tool, buildToolArgs(tp.tool, detail));
        return;
      }
      case 'done-success': {
        if (session.currentTool) {
          emitToolDone(tabId, true, match[1] || '');
          session.currentTool = null;
        }
        return;
      }
      case 'done-failure': {
        if (session.currentTool) {
          emitToolDone(tabId, false, match[1] || '');
          session.currentTool = null;
        }
        return;
      }
      case 'output': {
        emitToolOutput(tabId, match[1] || '', 0);
        return;
      }
      case 'heading': {
        // Headings are treated as text
        emitText(tabId, match[1] || '');
        return;
      }
    }
  }

  // If inside a tool, treat unmatched lines as tool output
  if (session.currentTool) {
    emitToolOutput(tabId, clean, 0);
    return;
  }

  // Otherwise treat as agent text
  emitText(tabId, clean);
}

function buildToolArgs(toolName, detail) {
  switch (toolName) {
    case 'Bash': return { command: detail };
    case 'Read': return { file_path: detail };
    case 'Write': return { file_path: detail };
    case 'Edit': return { file_path: detail };
    case 'Grep': return { pattern: detail };
    case 'Glob': return { pattern: detail };
    default: return {};
  }
}

export function stopSession(session) {
  if (!session.process) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /T /F /PID ${session.process.pid}`, { stdio: 'pipe' });
    } else {
      session.process.kill('SIGTERM');
    }
  } catch {
    // Process may already be gone
  }
  session.process = null;
}

export function destroySession(session) {
  stopSession(session);
  session.busy = false;
}

export function getStatus(session) {
  return {
    model: session.lastModel || session.model || '',
    provider: 'opencode',
    tokenEstimate: session.tokenEstimate,
    maxTokens: 128000,
    shellAllowed: true,
    editAllowed: true,
    filesEdited: 0,
  };
}

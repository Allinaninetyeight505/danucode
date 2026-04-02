// Claude Code Adapter
// Wraps the `claude` CLI as a subprocess with stream-json parsing.

import { spawn, execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  emitToolStart, emitToolOutput, emitToolDone,
  emitText, emitTextDone, emitError,
  getToolCategory,
} from '../event-adapter.js';

// Resolve claude binary path at import time
let claudeBinary = 'claude';
try {
  const result = execSync('where claude', { stdio: 'pipe', encoding: 'utf-8' }).trim();
  const lines = result.split(/\r?\n/);
  if (lines.length > 0 && lines[0]) {
    claudeBinary = lines[0].trim();
  }
} catch {
  // Fallback: try common paths
  const candidates = [
    resolve(process.env.APPDATA || '', 'npm', 'claude.cmd'),
    resolve(process.env.LOCALAPPDATA || '', 'npm', 'claude.cmd'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      claudeBinary = p;
      break;
    }
  }
}

export const meta = {
  id: 'claude-code',
  name: 'Claude Code',
  supervision: 'standard',
  description: 'Claude Code CLI agent with standard supervision via --dangerously-skip-permissions.',
};

export function createSession(tabId, cwd, config) {
  return {
    id: tabId,
    backend: 'claude-code',
    supervision: 'standard',
    cwd,
    sessionUuid: randomUUID(),
    turnCount: 0,
    model: config?.model || '',
    process: null,
    busy: false,
    tokenEstimate: 0,
    totalCost: 0,
    lastModel: '',
  };
}

export async function sendMessage(session, message) {
  return new Promise((resolveMsg, rejectMsg) => {
    const tabId = session.id;
    const args = [
      '-p', message,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
    ];

    // Session continuity: first turn starts a session, subsequent turns resume it
    if (session.turnCount === 0) {
      args.push('--session-id', session.sessionUuid);
    } else {
      args.push('--resume', session.sessionUuid);
    }

    if (session.model) {
      args.push('--model', session.model);
    }

    session.turnCount++;
    session.busy = true;

    const child = spawn(claudeBinary, args, {
      cwd: session.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env },
    });

    session.process = child;

    let stdoutBuffer = '';

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      // Parse NDJSON: split on newlines
      const lines = stdoutBuffer.split('\n');
      // Keep the last incomplete line in the buffer
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          processStreamEvent(session, tabId, event);
        } catch {
          // Not valid JSON — ignore partial lines
        }
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
      // Flush any remaining buffer
      if (stdoutBuffer.trim()) {
        try {
          const event = JSON.parse(stdoutBuffer.trim());
          processStreamEvent(session, tabId, event);
        } catch {
          // ignore
        }
      }
      if (code !== 0 && code !== null) {
        emitError(tabId, `Claude Code process exited with code ${code}`);
      }
      resolveMsg();
    });

    child.on('error', (err) => {
      session.process = null;
      session.busy = false;
      emitError(tabId, `Failed to spawn claude: ${err.message}`);
      rejectMsg(err);
    });
  });
}

function processStreamEvent(session, tabId, event) {
  if (!event || !event.type) return;

  switch (event.type) {
    case 'system': {
      // System events may contain model info
      if (event.model) {
        session.lastModel = event.model;
      }
      break;
    }

    case 'assistant': {
      // Assistant message with content blocks
      if (Array.isArray(event.content)) {
        for (const block of event.content) {
          if (block.type === 'tool_use') {
            emitToolStart(tabId, block.name || 'unknown', block.input || {});
          } else if (block.type === 'text') {
            emitText(tabId, block.text || '');
          }
        }
      } else if (event.message?.content) {
        // Alternative format: message.content array
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            emitToolStart(tabId, block.name || 'unknown', block.input || {});
          } else if (block.type === 'text') {
            emitText(tabId, block.text || '');
          }
        }
      }
      break;
    }

    case 'user': {
      // User messages contain tool_result blocks
      if (Array.isArray(event.content)) {
        for (const block of event.content) {
          if (block.type === 'tool_result') {
            const resultText = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map(c => c.text || '').join('\n')
                : '';
            const lines = resultText.split('\n');
            const preview = lines.slice(0, 12).join('\n');
            const suffix = lines.length > 12 ? `\n... ${lines.length - 12} more lines` : '';
            emitToolOutput(tabId, preview + suffix, lines.length);
            const failed = block.is_error || resultText.startsWith('Error:');
            emitToolDone(tabId, !failed, failed ? 'failed' : '');
          }
        }
      }
      break;
    }

    case 'result': {
      // Final result with cost/usage info
      if (event.cost_usd !== undefined) {
        session.totalCost += event.cost_usd;
      }
      if (event.usage) {
        session.tokenEstimate = (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0);
      }
      emitTextDone(tabId);
      break;
    }

    default:
      break;
  }
}

export function stopSession(session) {
  if (!session.process) return;
  try {
    if (process.platform === 'win32') {
      // On Windows use taskkill to kill the process tree
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
    provider: 'anthropic',
    tokenEstimate: session.tokenEstimate,
    maxTokens: 200000,
    shellAllowed: true,
    editAllowed: true,
    filesEdited: 0,
  };
}

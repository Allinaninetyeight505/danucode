import { execSync } from 'node:child_process';
import { getConfig } from './api.js';

export async function runPreHooks(toolName, args) {
  return runHooks('preToolUse', toolName, args);
}

export async function runPostHooks(toolName, args, result) {
  return runHooks('postToolUse', toolName, args, result);
}

function runHooks(phase, toolName, args, result) {
  const config = getConfig();
  const hooks = config?.hooks?.[phase];
  if (!hooks || !Array.isArray(hooks)) return;

  for (const hook of hooks) {
    // Match tool name or wildcard
    if (hook.tool !== '*' && hook.tool !== toolName) continue;

    const env = {
      ...process.env,
      TOOL_NAME: toolName,
      FILE_PATH: args.file_path || args.url || '',
      COMMAND: args.command || '',
      PATTERN: args.pattern || '',
      RESULT_LENGTH: String(result?.length || 0),
    };

    try {
      execSync(hook.command, {
        encoding: 'utf-8',
        timeout: 10000,
        cwd: process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });
    } catch {
      // Hook failures are non-fatal in core — callers can handle errors
    }
  }
}

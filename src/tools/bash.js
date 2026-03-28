import { execSync } from 'node:child_process';

// Detect bash path on Windows
let SHELL = '/bin/bash';
if (process.platform === 'win32') {
  try {
    const found = execSync('where bash', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim().split(/\r?\n/)[0];
    if (found) SHELL = found;
  } catch {
    SHELL = 'C:/Program Files/Git/usr/bin/bash.exe';
  }
}

export const definition = {
  type: 'function',
  function: {
    name: 'Bash',
    description: 'Executes a bash command and returns its output. Use Unix shell syntax.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (max 300000). Default: 120000' },
      },
      required: ['command'],
    },
  },
};

export async function execute({ command, timeout }) {
  const maxTimeout = Math.min(timeout ?? 120000, 300000);
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: maxTimeout,
      cwd: process.cwd(),
      shell: SHELL,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output || '(no output)';
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '');
    return out || `Command failed with exit code ${err.status}`;
  }
}

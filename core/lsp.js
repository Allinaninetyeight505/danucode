import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

let lspServer = null;
let pendingRequests = new Map();
let nextId = 1;
let buffer = '';

// Auto-detect which LSP to use based on project files
const LSP_CONFIGS = {
  'tsconfig.json': { command: 'npx', args: ['typescript-language-server', '--stdio'], name: 'TypeScript' },
  'package.json': { command: 'npx', args: ['typescript-language-server', '--stdio'], name: 'TypeScript' },
  'pyproject.toml': { command: 'pylsp', args: [], name: 'Python' },
  'setup.py': { command: 'pylsp', args: [], name: 'Python' },
  'go.mod': { command: 'gopls', args: ['serve'], name: 'Go' },
  'Cargo.toml': { command: 'rust-analyzer', args: [], name: 'Rust' },
};

export async function initLsp() {
  const { existsSync } = await import('node:fs');
  const cwd = process.cwd();

  // Find matching LSP config
  let config = null;
  for (const [file, cfg] of Object.entries(LSP_CONFIGS)) {
    if (existsSync(resolve(cwd, file))) {
      config = cfg;
      break;
    }
  }

  if (!config) return;

  try {
    const proc = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    });

    lspServer = { process: proc, name: config.name };

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      processBuffer();
    });

    proc.stderr.on('data', (data) => {
      // Silently ignore LSP stderr (often debug messages)
    });

    proc.on('close', () => {
      lspServer = null;
    });

    proc.on('error', () => {
      lspServer = null;
    });

    // Initialize
    const initResult = await sendLspRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${cwd.replace(/\\/g, '/')}`,
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          hover: { dynamicRegistration: false },
        },
      },
    });

    // Send initialized notification
    sendLspNotification('initialized', {});
  } catch {
    lspServer = null;
  }
}

function processBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length: (\d+)/);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1]);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break; // Not enough data yet

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const msg = JSON.parse(body);
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        resolve(msg);
      }
    } catch {
      // Skip invalid JSON
    }
  }
}

function sendLspRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!lspServer) {
      reject(new Error('LSP not connected'));
      return;
    }

    const id = nextId++;
    const timeoutId = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }
    }, 10000);

    pendingRequests.set(id, {
      resolve: (val) => { clearTimeout(timeoutId); resolve(val); },
      reject: (err) => { clearTimeout(timeoutId); reject(err); },
    });

    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const msg = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

    try {
      lspServer.process.stdin.write(msg);
    } catch (err) {
      clearTimeout(timeoutId);
      pendingRequests.delete(id);
      reject(err);
    }
  });
}

function sendLspNotification(method, params) {
  if (!lspServer) return;
  const body = JSON.stringify({ jsonrpc: '2.0', method, params });
  const msg = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  try {
    lspServer.process.stdin.write(msg);
  } catch {
    // Ignore
  }
}

function fileUri(filePath) {
  const normalized = resolve(filePath).replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\//, '')}`;
}

// Public API for the LSP tool
export async function gotoDefinition(filePath, line, character) {
  if (!lspServer) return 'LSP not available. No language server detected for this project.';

  // Open the file first (textDocument/didOpen)
  const { readFileSync } = await import('node:fs');
  const content = readFileSync(filePath, 'utf-8');
  sendLspNotification('textDocument/didOpen', {
    textDocument: { uri: fileUri(filePath), languageId: 'typescript', version: 1, text: content },
  });

  try {
    const result = await sendLspRequest('textDocument/definition', {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character },
    });

    if (!result.result || (Array.isArray(result.result) && result.result.length === 0)) {
      return 'No definition found.';
    }

    const locations = Array.isArray(result.result) ? result.result : [result.result];
    return locations.map(loc => {
      const uri = loc.uri || loc.targetUri;
      const range = loc.range || loc.targetRange;
      const file = uri?.replace('file:///', '').replace('file://', '');
      const line = range?.start?.line ? range.start.line + 1 : '?';
      return `${file}:${line}`;
    }).join('\n');
  } catch (err) {
    return `LSP error: ${err.message}`;
  }
}

export async function findReferences(filePath, line, character) {
  if (!lspServer) return 'LSP not available.';

  const { readFileSync } = await import('node:fs');
  const content = readFileSync(filePath, 'utf-8');
  sendLspNotification('textDocument/didOpen', {
    textDocument: { uri: fileUri(filePath), languageId: 'typescript', version: 1, text: content },
  });

  try {
    const result = await sendLspRequest('textDocument/references', {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character },
      context: { includeDeclaration: true },
    });

    if (!result.result || result.result.length === 0) {
      return 'No references found.';
    }

    return result.result.map(loc => {
      const file = loc.uri?.replace('file:///', '').replace('file://', '');
      const line = loc.range?.start?.line ? loc.range.start.line + 1 : '?';
      return `${file}:${line}`;
    }).join('\n');
  } catch (err) {
    return `LSP error: ${err.message}`;
  }
}

export async function hover(filePath, line, character) {
  if (!lspServer) return 'LSP not available.';

  const { readFileSync } = await import('node:fs');
  const content = readFileSync(filePath, 'utf-8');
  sendLspNotification('textDocument/didOpen', {
    textDocument: { uri: fileUri(filePath), languageId: 'typescript', version: 1, text: content },
  });

  try {
    const result = await sendLspRequest('textDocument/hover', {
      textDocument: { uri: fileUri(filePath) },
      position: { line: line - 1, character },
    });

    if (!result.result?.contents) {
      return 'No hover info.';
    }

    const contents = result.result.contents;
    if (typeof contents === 'string') return contents;
    if (contents.value) return contents.value;
    if (Array.isArray(contents)) return contents.map(c => c.value || c).join('\n');
    return JSON.stringify(contents);
  } catch (err) {
    return `LSP error: ${err.message}`;
  }
}

export function isLspAvailable() {
  return lspServer !== null;
}

export function shutdownLsp() {
  if (lspServer) {
    try {
      sendLspNotification('shutdown', null);
      sendLspNotification('exit', null);
      lspServer.process.kill();
    } catch {}
    lspServer = null;
  }
}

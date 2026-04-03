import { spawn } from 'node:child_process';
import { getConfig } from './api.js';

const connections = new Map(); // serverName -> { process, tools, pending }

// Initialize all configured MCP servers
export async function initMcpServers() {
  const config = getConfig();
  const servers = config?.mcp?.servers;
  if (!servers) return;

  for (const [name, serverConfig] of Object.entries(servers)) {
    try {
      await connectServer(name, serverConfig);
    } catch (err) {
      // Connection failures are non-fatal — callers can check tool availability
    }
  }
}

async function connectServer(name, serverConfig) {
  const { command, args = [], env = {} } = serverConfig;

  const proc = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  const conn = {
    process: proc,
    tools: [],
    pending: new Map(),
    nextId: 1,
    buffer: '',
  };

  connections.set(name, conn);

  // Read JSON-RPC responses from stdout
  proc.stdout.on('data', (data) => {
    conn.buffer += data.toString();
    // Process complete JSON-RPC messages (newline-delimited)
    const lines = conn.buffer.split('\n');
    conn.buffer = lines.pop(); // Keep incomplete line in buffer
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && conn.pending.has(msg.id)) {
          const { resolve } = conn.pending.get(msg.id);
          conn.pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  });

  proc.stderr.on('data', (data) => {
    // Stderr from MCP servers is silently ignored in core
  });

  proc.on('close', () => {
    connections.delete(name);
  });

  // Initialize: send initialize request
  try {
    const initResult = await sendRequest(conn, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'danu', version: '0.1.0' },
    });

    // Send initialized notification
    sendNotification(conn, 'notifications/initialized', {});

    // List tools
    const toolsResult = await sendRequest(conn, 'tools/list', {});
    if (toolsResult.result?.tools) {
      conn.tools = toolsResult.result.tools;
    }
  } catch (err) {
    proc.kill();
    connections.delete(name);
  }
}

function sendRequest(conn, method, params) {
  return new Promise((resolve, reject) => {
    const id = conn.nextId++;
    const timeoutId = setTimeout(() => {
      if (conn.pending.has(id)) {
        conn.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }
    }, 10000);

    conn.pending.set(id, {
      resolve: (val) => { clearTimeout(timeoutId); resolve(val); },
      reject: (err) => { clearTimeout(timeoutId); reject(err); },
    });

    try {
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      conn.process.stdin.write(msg);
    } catch (err) {
      clearTimeout(timeoutId);
      conn.pending.delete(id);
      reject(err);
    }
  });
}

function sendNotification(conn, method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
  conn.process.stdin.write(msg);
}

// Get all MCP tool definitions in OpenAI function format
export function getMcpToolDefinitions() {
  const defs = [];
  for (const [serverName, conn] of connections) {
    for (const tool of conn.tools) {
      defs.push({
        type: 'function',
        function: {
          name: `mcp_${serverName}_${tool.name}`,
          description: tool.description || `MCP tool: ${tool.name} (${serverName})`,
          parameters: tool.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }
  return defs;
}

// Execute an MCP tool call
export async function executeMcpTool(fullName, args) {
  // Parse: mcp_serverName_toolName
  const match = fullName.match(/^mcp_([^_]+)_(.+)$/);
  if (!match) return `Unknown MCP tool: ${fullName}`;

  const [, serverName, toolName] = match;
  const conn = connections.get(serverName);
  if (!conn) return `MCP server '${serverName}' not connected.`;

  try {
    const result = await sendRequest(conn, 'tools/call', {
      name: toolName,
      arguments: args,
    });

    if (result.error) {
      return `MCP error: ${result.error.message || JSON.stringify(result.error)}`;
    }

    // Extract text content from result
    const content = result.result?.content;
    if (Array.isArray(content)) {
      return content.map(c => c.text || JSON.stringify(c)).join('\n');
    }
    return JSON.stringify(result.result);
  } catch (err) {
    return `MCP tool error: ${err.message}`;
  }
}

// Check if a tool name is an MCP tool
export function isMcpTool(name) {
  return name.startsWith('mcp_');
}

// Shut down all MCP servers
export function shutdownMcpServers() {
  for (const [name, conn] of connections) {
    try {
      conn.process.kill();
    } catch {}
  }
  connections.clear();
}

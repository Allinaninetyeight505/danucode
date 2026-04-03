import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

let customTools = {};

export async function loadCustomTools() {
  customTools = {};

  const dirs = [
    join(homedir(), '.danu', 'tools'),
    resolve(process.cwd(), '.danu', 'tools'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const fullPath = resolve(dir, file);
        const mod = await import(pathToFileURL(fullPath).href);

        if (mod.definition && mod.execute) {
          const name = mod.definition.function.name;
          customTools[name] = mod;
        }
      } catch {
        // Skip tools that fail to load — callers can check availability
      }
    }
  }
}

export function getCustomToolDefinitions() {
  return Object.values(customTools).map(t => t.definition);
}

export function isCustomTool(name) {
  return name in customTools;
}

export async function executeCustomTool(name, args) {
  const tool = customTools[name];
  if (!tool) return `Unknown custom tool: ${name}`;
  try {
    return await tool.execute(args);
  } catch (err) {
    return `Custom tool error: ${err.message}`;
  }
}

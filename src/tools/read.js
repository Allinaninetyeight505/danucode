import { readFile } from 'node:fs/promises';
import { isIgnored } from '../ignore.js';

export const definition = {
  type: 'function',
  function: {
    name: 'Read',
    description: 'Reads a file and returns its contents with line numbers. Use absolute paths.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read' },
        offset: { type: 'number', description: 'Line number to start from (1-based). Default: 1' },
        limit: { type: 'number', description: 'Max lines to read. Default: 2000' },
      },
      required: ['file_path'],
    },
  },
};

export async function execute({ file_path, offset = 1, limit = 2000 }) {
  if (isIgnored(file_path)) {
    return `Blocked: ${file_path} is excluded by .danuignore`;
  }
  const content = await readFile(file_path, 'utf-8');
  const lines = content.split('\n');
  const start = Math.max(0, offset - 1);
  const slice = lines.slice(start, start + limit);

  return slice
    .map((line, i) => `${String(start + i + 1).padStart(6)}  ${line}`)
    .join('\n');
}

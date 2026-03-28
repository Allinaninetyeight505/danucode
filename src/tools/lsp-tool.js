import { gotoDefinition, findReferences, hover, isLspAvailable } from '../lsp.js';

export const definition = {
  type: 'function',
  function: {
    name: 'LSP',
    description: 'Query the Language Server for code intelligence. Get definitions, references, or type info for a symbol at a specific position in a file.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['definition', 'references', 'hover'], description: 'What to look up' },
        file_path: { type: 'string', description: 'Absolute path to the file' },
        line: { type: 'number', description: 'Line number (1-based)' },
        character: { type: 'number', description: 'Column/character position (0-based)' },
      },
      required: ['action', 'file_path', 'line', 'character'],
    },
  },
};

export async function execute({ action, file_path, line, character }) {
  if (!isLspAvailable()) {
    return 'LSP not available. No language server detected for this project type.';
  }

  switch (action) {
    case 'definition':
      return gotoDefinition(file_path, line, character);
    case 'references':
      return findReferences(file_path, line, character);
    case 'hover':
      return hover(file_path, line, character);
    default:
      return `Unknown LSP action: ${action}`;
  }
}

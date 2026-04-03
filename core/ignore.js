import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

let patterns = null;

export function loadIgnorePatterns() {
  patterns = [];
  const cwd = process.cwd();

  // Check for .danuignore in cwd and parent dirs (up to 5 levels)
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    const file = resolve(dir, '.danuignore');
    if (existsSync(file)) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      patterns.push(...lines);
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  // Always ignore these (sensitive files)
  patterns.push('.env', '.env.*', '*.pem', '*.key', 'credentials.json');
}

export function isIgnored(filePath) {
  if (!patterns) loadIgnorePatterns();

  const cwd = process.cwd();
  // Get relative path for matching
  let rel;
  try {
    rel = relative(cwd, filePath).replace(/\\/g, '/');
  } catch {
    rel = filePath.replace(/\\/g, '/');
  }

  for (const pattern of patterns) {
    if (matchPattern(rel, pattern)) return true;
  }
  return false;
}

function matchPattern(path, pattern) {
  // Simple glob matching
  // Handle directory patterns ending with /
  if (pattern.endsWith('/')) {
    const dir = pattern.slice(0, -1);
    if (path.startsWith(dir + '/') || path === dir) return true;
    if (path.includes('/' + dir + '/')) return true;
    return false;
  }

  // Handle ** patterns
  if (pattern.includes('**')) {
    const regex = patternToRegex(pattern);
    return regex.test(path);
  }

  // Handle * patterns
  if (pattern.includes('*')) {
    const regex = patternToRegex(pattern);
    return regex.test(path);
  }

  // Exact match or basename match
  if (path === pattern) return true;
  if (path.endsWith('/' + pattern)) return true;
  const basename = path.split('/').pop();
  if (basename === pattern) return true;

  return false;
}

function patternToRegex(pattern) {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp('^' + regex + '$');
}

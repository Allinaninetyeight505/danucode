import { writeFileSync } from 'node:fs';
import chalk from 'chalk';

const history = []; // { path, before, after, timestamp }
let redoStack = [];
const MAX_HISTORY = 50;

export function trackChange(filePath, beforeContent, afterContent) {
  history.push({
    path: filePath,
    before: beforeContent,
    after: afterContent,
    timestamp: Date.now(),
  });
  if (history.length > MAX_HISTORY) history.shift();
  redoStack = []; // clear redo on new change
}

export function undo() {
  if (history.length === 0) return { ok: false, error: 'Nothing to undo.' };

  const entry = history.pop();
  redoStack.push(entry);

  try {
    if (entry.before === null) {
      return { ok: true, message: `Can't delete created file. Previous state was: no file at ${entry.path}`, path: entry.path };
    }
    writeFileSync(entry.path, entry.before, 'utf-8');
    return { ok: true, message: `Reverted ${entry.path}`, path: entry.path };
  } catch (err) {
    return { ok: false, error: `Failed to undo: ${err.message}` };
  }
}

export function redo() {
  if (redoStack.length === 0) return { ok: false, error: 'Nothing to redo.' };

  const entry = redoStack.pop();
  history.push(entry);

  try {
    writeFileSync(entry.path, entry.after, 'utf-8');
    return { ok: true, message: `Re-applied change to ${entry.path}`, path: entry.path };
  } catch (err) {
    return { ok: false, error: `Failed to redo: ${err.message}` };
  }
}

export function getHistoryCount() {
  return history.length;
}

export function getRedoCount() {
  return redoStack.length;
}

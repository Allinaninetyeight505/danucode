import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  bufferEvent, loadPendingEvents, clearPendingBuffer,
  hasPendingLearnings, applyLearnings, reflectOnSession,
} from '../core/auto-learn.js';
import { loadGraph, saveGraph, resetCache, addNode, findNodes } from '../core/memory.js';
import { EventType } from '../core/events.js';

const SESSIONS_DIR = join(homedir(), '.danu', 'sessions');
const PENDING_PATH = join(SESSIONS_DIR, 'pending-learn.jsonl');

describe('Event buffering', () => {
  beforeEach(() => {
    clearPendingBuffer();
  });

  afterEach(() => {
    clearPendingBuffer();
  });

  it('buffers learnable events to JSONL file', () => {
    bufferEvent({ type: EventType.TOOL_START, tool: 'Bash', detail: 'npm test' });
    bufferEvent({ type: EventType.TOOL_DONE, success: true, summary: '' });

    assert.ok(existsSync(PENDING_PATH), 'Pending file should exist');
    const lines = readFileSync(PENDING_PATH, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0]);
    assert.equal(first.type, EventType.TOOL_START);
    assert.equal(first.tool, 'Bash');
    assert.ok(first.ts, 'Should have timestamp');
  });

  it('ignores non-learnable events', () => {
    bufferEvent({ type: EventType.TEXT_DONE });
    bufferEvent({ type: EventType.TASK_UPDATE, tasks: [] });

    assert.ok(!existsSync(PENDING_PATH) || readFileSync(PENDING_PATH, 'utf-8').trim() === '',
      'No learnable events should be buffered');
  });

  it('appends incrementally', () => {
    bufferEvent({ type: EventType.TOOL_START, tool: 'Read', detail: 'file.js' });
    bufferEvent({ type: EventType.TOOL_DONE, success: true });
    bufferEvent({ type: EventType.TOOL_START, tool: 'Write', detail: 'file.js' });

    const lines = readFileSync(PENDING_PATH, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 3);
  });

  it('loadPendingEvents parses JSONL correctly', () => {
    bufferEvent({ type: EventType.TOOL_START, tool: 'Bash', detail: 'ls' });
    bufferEvent({ type: EventType.TOOL_DONE, success: false, summary: 'Error: command failed' });
    bufferEvent({ type: EventType.ERROR, message: 'Something broke' });

    const events = loadPendingEvents();
    assert.equal(events.length, 3);
    assert.equal(events[0].tool, 'Bash');
    assert.equal(events[1].success, false);
    assert.equal(events[2].message, 'Something broke');
  });

  it('loadPendingEvents returns empty array when no file', () => {
    const events = loadPendingEvents();
    assert.deepEqual(events, []);
  });

  it('clearPendingBuffer removes the file', () => {
    bufferEvent({ type: EventType.TOOL_START, tool: 'Read', detail: 'test.js' });
    assert.ok(existsSync(PENDING_PATH));

    clearPendingBuffer();
    assert.ok(!existsSync(PENDING_PATH));
  });

  it('hasPendingLearnings detects pending file', () => {
    assert.equal(hasPendingLearnings(), false);
    bufferEvent({ type: EventType.TOOL_START, tool: 'Read', detail: 'test.js' });
    assert.equal(hasPendingLearnings(), true);
    clearPendingBuffer();
    assert.equal(hasPendingLearnings(), false);
  });
});

describe('Apply learnings', () => {
  beforeEach(() => {
    resetCache();
    saveGraph({ version: 1, nodes: {}, edges: [], adjacency: {} });
  });

  it('adds valid learnings to the graph', () => {
    const learnings = [
      {
        type: 'pattern',
        text: 'Always run npm install before npm test in this project',
        keywords: ['npm', 'install', 'test', 'project'],
      },
      {
        type: 'preference',
        text: 'User prefers ESM imports over CommonJS require statements',
        keywords: ['esm', 'imports', 'commonjs', 'require'],
      },
    ];

    const added = applyLearnings(learnings);
    assert.equal(added, 2);

    const graph = loadGraph();
    const nodeCount = Object.keys(graph.nodes).length;
    assert.equal(nodeCount, 2);
  });

  it('maps convention and warning types to pattern', () => {
    const learnings = [
      { type: 'convention', text: 'All API routes use kebab-case naming convention', keywords: ['api', 'routes', 'kebab'] },
      { type: 'warning', text: 'The build script fails on Windows due to path separators', keywords: ['build', 'windows', 'path'] },
    ];

    const added = applyLearnings(learnings);
    assert.equal(added, 2);

    const graph = loadGraph();
    const nodes = Object.values(graph.nodes);
    assert.ok(nodes.every(n => n.type === 'pattern'), 'Convention and warning should map to pattern');
  });

  it('skips learnings with no text', () => {
    const learnings = [
      { type: 'pattern', text: '', keywords: ['empty'] },
      { type: 'pattern', keywords: ['no-text'] },
      { type: 'pattern', text: 'Valid learning with enough meaningful content', keywords: ['valid', 'learning'] },
    ];

    const added = applyLearnings(learnings);
    assert.equal(added, 1);
  });

  it('returns 0 for empty or null learnings', () => {
    assert.equal(applyLearnings([]), 0);
    assert.equal(applyLearnings(null), 0);
    assert.equal(applyLearnings(undefined), 0);
  });

  it('creates edges between distinct nodes via targetKeywords', () => {
    // Create two nodes with clearly different keywords
    addNode({
      type: 'pattern',
      text: 'Docker containers require network bridge configuration',
      keywords: ['docker', 'containers', 'network', 'bridge'],
      project: process.cwd(),
    });
    saveGraph();

    const learnings = [
      {
        type: 'warning',
        text: 'Redis sentinel failover breaks when cluster topology changes',
        keywords: ['redis', 'sentinel', 'failover', 'cluster'],
        edges: [{ targetKeywords: ['docker', 'containers', 'network'], type: 'caused-by' }],
      },
    ];

    const added = applyLearnings(learnings);
    assert.equal(added, 1);

    const graph = loadGraph();
    assert.ok(graph.edges.length >= 1, 'Should have created an edge');
    assert.equal(graph.edges[0].type, 'caused-by');
  });
});

describe('Crash recovery', () => {
  beforeEach(() => {
    clearPendingBuffer();
  });

  afterEach(() => {
    clearPendingBuffer();
  });

  it('hasPendingLearnings returns true when pending file exists from crash', () => {
    // Simulate a crash — events were buffered but never reflected
    mkdirSync(SESSIONS_DIR, { recursive: true });
    writeFileSync(PENDING_PATH, JSON.stringify({ type: 'tool-start', tool: 'Bash', detail: 'npm test', ts: Date.now() }) + '\n');

    assert.ok(hasPendingLearnings());

    const events = loadPendingEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].tool, 'Bash');
  });

  it('handles corrupt JSONL gracefully', () => {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    writeFileSync(PENDING_PATH, '{"valid": true}\nnot json\n{"also": "valid"}\n');

    const events = loadPendingEvents();
    assert.equal(events.length, 2, 'Should skip corrupt lines');
  });
});

describe('Config: auto_learn disabled', () => {
  it('applyLearnings still works (config check is in runAutoLearn)', () => {
    resetCache();
    saveGraph({ version: 1, nodes: {}, edges: [], adjacency: {} });

    // applyLearnings doesn't check config — it's a pure graph operation
    const added = applyLearnings([
      { type: 'pattern', text: 'Something worth remembering about the project structure', keywords: ['project', 'structure'] },
    ]);
    assert.equal(added, 1);
  });
});

describe('Reflection prompt construction', () => {
  it('reflectOnSession returns empty array when no events', async () => {
    const result = await reflectOnSession([], null);
    assert.deepEqual(result, []);
  });

  it('reflectOnSession returns empty array when events is null', async () => {
    const result = await reflectOnSession(null, null);
    assert.deepEqual(result, []);
  });
});

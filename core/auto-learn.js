// core/auto-learn.js — Post-session LLM reflection for automatic graph memory enrichment.
// Buffers events during a session, then runs a lightweight LLM call at session end
// to extract learnings worth remembering. Zero terminal dependencies.

import { readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { chatCompletion, getConfig } from './api.js';
import { loadGraph, saveGraph, addNode, addEdge, findNodes } from './memory.js';
import { EventType } from './events.js';

const SESSIONS_DIR = join(homedir(), '.danu', 'sessions');
const PENDING_PATH = join(SESSIONS_DIR, 'pending-learn.jsonl');

// --- Event Buffering ---

export function bufferEvent(event) {
  // Only buffer events worth learning from
  if (!isLearnableEvent(event)) return;

  mkdirSync(SESSIONS_DIR, { recursive: true });
  const line = JSON.stringify({ ...event, ts: Date.now() });
  appendFileSync(PENDING_PATH, line + '\n', 'utf-8');
}

function isLearnableEvent(event) {
  switch (event.type) {
    case EventType.TOOL_START:
    case EventType.TOOL_DONE:
    case EventType.ERROR:
    case EventType.TEXT:
      return true;
    default:
      return false;
  }
}

export function hasPendingLearnings() {
  return existsSync(PENDING_PATH);
}

export function loadPendingEvents() {
  if (!existsSync(PENDING_PATH)) return [];
  try {
    const raw = readFileSync(PENDING_PATH, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function clearPendingBuffer() {
  try { unlinkSync(PENDING_PATH); } catch { /* noop */ }
}

// --- Reflection ---

function buildReflectionPrompt(events, existingNodes) {
  // Compress events into a summary the LLM can reason about
  const toolEvents = [];
  let currentTool = null;

  for (const e of events) {
    if (e.type === EventType.TOOL_START) {
      currentTool = { tool: e.tool, detail: e.detail || '' };
    } else if (e.type === EventType.TOOL_DONE && currentTool) {
      toolEvents.push({ ...currentTool, success: e.success, summary: e.summary || '' });
      currentTool = null;
    } else if (e.type === EventType.ERROR) {
      toolEvents.push({ tool: 'ERROR', detail: e.message, success: false, summary: e.message });
    }
  }

  // Extract user messages that followed failures (likely corrections)
  const userTexts = events
    .filter(e => e.type === EventType.TEXT)
    .map(e => e.content)
    .slice(0, 20); // Cap to avoid huge prompts

  const failures = toolEvents.filter(t => !t.success);
  const successes = toolEvents.filter(t => t.success);

  const eventSummary = [
    `Tool calls: ${toolEvents.length} total, ${failures.length} failed, ${successes.length} succeeded.`,
    failures.length > 0 ? `\nFailures:\n${failures.map(f => `- ${f.tool}: ${f.detail} → ${f.summary}`).join('\n')}` : '',
    userTexts.length > 0 ? `\nUser messages (may contain corrections):\n${userTexts.slice(0, 10).map(t => `- ${t.slice(0, 200)}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const existingSummary = existingNodes.length > 0
    ? `\nExisting memories (do NOT duplicate these):\n${existingNodes.map(n => `- [${n.type}] ${n.text}`).join('\n')}`
    : '';

  return [
    {
      role: 'system',
      content: `You extract learnings from coding sessions. Return ONLY a JSON array, no other text.`,
    },
    {
      role: 'user',
      content: `Review this coding session's events. Extract ONLY insights worth remembering for future sessions on this project.

Worth remembering: error patterns, user corrections, project conventions discovered, architectural decisions, tool usage patterns that worked or failed, warnings about gotchas.
NOT worth remembering: routine successful operations, file contents, transient state, things already known.

Session events:
${eventSummary}
${existingSummary}

Return a JSON array of memory nodes. Each node:
{ "type": "pattern"|"preference"|"convention"|"decision"|"warning", "text": "concise description", "keywords": ["keyword1", "keyword2"], "edges": [{ "targetKeywords": ["keyword1"], "type": "relates-to"|"caused-by"|"prevents" }] }

The edges.targetKeywords should match keywords of existing memories to link to. Only add edges when there's a real relationship.
Return an empty array [] if nothing from this session is worth remembering.
Return ONLY the JSON array, no markdown, no explanation.`,
    },
  ];
}

export async function reflectOnSession(events, emitStatus) {
  if (!events || events.length === 0) return [];

  const config = getConfig();
  if (!config) return [];

  const graph = loadGraph();
  const existingNodes = Object.values(graph.nodes).slice(0, 30); // Cap for prompt size

  const messages = buildReflectionPrompt(events, existingNodes);

  if (emitStatus) emitStatus('Learning from session...');

  try {
    const response = await chatCompletion(messages, []);

    // Parse the response — handle both OpenAI and Anthropic response shapes
    const content = response?.choices?.[0]?.message?.content  // OpenAI format
      || response?.message?.content                           // Anthropic via convertFromAnthropicResponse
      || response?.content?.[0]?.text                         // Raw Anthropic
      || response?.content                                    // Fallback
      || '';

    const text = typeof content === 'string' ? content : JSON.stringify(content);

    // Extract JSON array from response (handles markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const learnings = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(learnings)) return [];

    return learnings;
  } catch {
    // Reflection failed — don't block shutdown
    return [];
  }
}

// --- Apply Learnings ---

export function applyLearnings(learnings, emitStatus) {
  if (!learnings || learnings.length === 0) return 0;

  const VALID_TYPES = new Set(['pattern', 'preference', 'convention', 'decision', 'warning']);
  let added = 0;

  for (const learning of learnings) {
    if (!learning.text || typeof learning.text !== 'string') continue;

    const type = VALID_TYPES.has(learning.type) ? learning.type : 'pattern';
    // Map 'convention' and 'warning' to valid graph node types
    const graphType = (type === 'convention' || type === 'warning') ? 'pattern' : type;

    const nodeId = addNode({
      type: graphType,
      text: learning.text,
      keywords: Array.isArray(learning.keywords) ? learning.keywords : undefined,
      project: process.cwd(),
    });

    if (!nodeId) continue;
    added++;

    // Try to create edges to existing nodes via keyword matching
    if (Array.isArray(learning.edges)) {
      for (const edge of learning.edges) {
        if (!Array.isArray(edge.targetKeywords) || edge.targetKeywords.length === 0) continue;
        const query = edge.targetKeywords.join(' ');
        const matches = findNodes({ query, project: process.cwd() });
        if (matches.length > 0 && matches[0].id !== nodeId) {
          const edgeType = ['relates-to', 'caused-by', 'prevents'].includes(edge.type)
            ? edge.type : 'relates-to';
          addEdge({ source: nodeId, target: matches[0].id, type: edgeType });
        }
      }
    }
  }

  if (added > 0) {
    saveGraph();
    if (emitStatus) emitStatus(`Learned ${added} insight${added === 1 ? '' : 's'} from this session.`);
  }

  return added;
}

// --- Full Pipeline ---

export async function runAutoLearn(emitStatus) {
  const config = getConfig();
  if (config?.auto_learn === false) return 0;

  const events = loadPendingEvents();
  if (events.length === 0) {
    clearPendingBuffer();
    return 0;
  }

  const learnings = await reflectOnSession(events, emitStatus);
  const added = applyLearnings(learnings, emitStatus);
  clearPendingBuffer();
  return added;
}

// --- Crash Recovery ---

export async function recoverPendingLearnings(emitStatus) {
  if (!hasPendingLearnings()) return 0;
  if (emitStatus) emitStatus('Recovering learnings from previous session...');
  return runAutoLearn(emitStatus);
}

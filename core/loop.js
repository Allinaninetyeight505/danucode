// core/loop.js — Conversation loop.
// Emits structured events via an EventEmitter. Zero terminal dependencies.

import { streamChatCompletion } from './api.js';
import { buildSystemPrompt } from './system-prompt.js';
import { getToolDefinitions, executeTool } from './tools/index.js';
import { askPermissionCompat } from './permissions.js';
import { compactIfNeeded, isContextLengthError, compactOnError, checkContextWarning } from './context.js';
import { isPlanMode, getPlanModePrompt } from './planmode.js';
import { runPreHooks, runPostHooks } from './hooks.js';
import { classifyRisk, getCategory, EventType } from './events.js';
import { getTasks } from './tools/tasks.js';

const NEEDS_PERMISSION = new Set(['Bash', 'Write', 'Edit']);

// File access tracking: maps file_path -> { count, tools: Set of tool names }
const fileAccessCounts = new Map();

const FILE_ACCESS_TOOLS = new Set(['Read', 'Write', 'Edit']);

function trackFileAccess(toolName, args) {
  if (!FILE_ACCESS_TOOLS.has(toolName)) return;
  const filePath = args?.file_path;
  if (!filePath) return;

  const existing = fileAccessCounts.get(filePath);
  if (existing) {
    existing.count++;
    existing.tools.add(toolName);
  } else {
    fileAccessCounts.set(filePath, { count: 1, tools: new Set([toolName]) });
  }
}

export function getFileAccessCounts() {
  return Array.from(fileAccessCounts.entries())
    .map(([filePath, data]) => ({ filePath, count: data.count, tools: Array.from(data.tools) }))
    .sort((a, b) => b.count - a.count);
}

export function clearFileAccessCounts() {
  fileAccessCounts.clear();
}


// State for tracking thinking blocks during streaming
let inThinkBlock = false;

function stripThinking(text) {
  text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
  return text;
}

function processStreamChunk(chunk) {
  let result = '';
  let i = 0;
  while (i < chunk.length) {
    if (!inThinkBlock) {
      const thinkStart = chunk.indexOf('<think>', i);
      if (thinkStart === -1) {
        result += chunk.slice(i);
        break;
      } else {
        result += chunk.slice(i, thinkStart);
        inThinkBlock = true;
        i = thinkStart + 7;
      }
    } else {
      const thinkEnd = chunk.indexOf('</think>', i);
      if (thinkEnd === -1) {
        break;
      } else {
        inThinkBlock = false;
        i = thinkEnd + 8;
      }
    }
  }
  return result;
}

export function createConversation(tabId, emitter) {
  tabId = tabId || 'cli';
  const messages = [
    { role: 'system', content: buildSystemPrompt() }
  ];

  // Emit helper — only emits if an emitter is provided
  function emit(event, data) {
    if (emitter) emitter.emit(event, data);
  }

  async function send(userMessage, rl, signal) {
    inThinkBlock = false;
    messages.push({ role: 'user', content: userMessage });
    let contextRetries = 0;

    while (true) {
      const compacted = await compactIfNeeded(messages);
      if (compacted !== messages) {
        messages.length = 0;
        messages.push(...compacted);
      }

      if (isPlanMode() && messages[0]?.role === 'system') {
        const planPrompt = getPlanModePrompt();
        if (!messages[0].content.includes('Plan Mode Active')) {
          messages[0] = { role: 'system', content: messages[0].content + planPrompt };
        }
      }

      let assistantMsg;
      let textBuffer = '';
      let hasStreamedText = false;
      try {
        const currentTools = getToolDefinitions();
        const stream = streamChatCompletion(messages, currentTools, signal);

        for await (const event of stream) {
          if (signal?.aborted) {
            emit(EventType.INTERRUPTED, { reason: 'User interrupted' });
            messages.pop();
            return;
          }
          if (event.type === 'text') {
            const processed = processStreamChunk(event.content);
            if (processed) hasStreamedText = true;
            // Buffer into complete lines for event emission
            textBuffer += processed;
            const lines = textBuffer.split('\n');
            textBuffer = lines.pop() || '';
            for (const line of lines) {
              if (line.trim()) emit(EventType.TEXT, { content: line });
            }
          } else if (event.type === 'done') {
            if (assistantMsg) continue;
            // Flush remaining text buffer
            if (textBuffer.trim()) {
              emit(EventType.TEXT, { content: textBuffer });
              textBuffer = '';
            }
            emit(EventType.TEXT_DONE, {});
            assistantMsg = event.message;
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          emit(EventType.INTERRUPTED, { reason: 'User interrupted' });
          messages.pop();
          return;
        }
        if (isContextLengthError(err) && contextRetries < 2) {
          contextRetries++;
          const compacted = await compactOnError(messages);
          messages.length = 0;
          messages.push(...compacted);
          continue;
        }
        emit(EventType.ERROR, { message: `Error: ${err.message}` });
        messages.pop();
        return;
      }

      if (!assistantMsg) return;

      messages.push(assistantMsg);
      checkContextWarning(messages);

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        break;
      }

      for (const toolCall of assistantMsg.tool_calls) {
        if (signal?.aborted) {
          emit(EventType.INTERRUPTED, { reason: 'User interrupted' });
          return;
        }

        const { name } = toolCall.function;
        let args;
        try {
          args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch (parseErr) {
          emit(EventType.ERROR, { message: `Parse error: ${parseErr.message}` });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name,
            content: `Error: Invalid JSON in tool arguments: ${parseErr.message}. Please try again with valid JSON.`,
          });
          continue;
        }

        const detail = getToolDetail(name, args);
        emit(EventType.TOOL_START, {
          tool: name,
          detail,
          risk: classifyRisk(name, args),
          category: getCategory(name),
        });

        if (NEEDS_PERMISSION.has(name) && !isPlanMode()) {
          const granted = await askPermissionCompat(name, args, rl);
          if (!granted) {
            emit(EventType.TOOL_DONE, { success: false, summary: 'Permission denied' });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name,
              content: 'Permission denied by user.',
            });
            continue;
          }
        }

        await runPreHooks(name, args);

        let result;
        try {
          result = await executeTool(name, args);
        } catch (err) {
          result = `Tool error: ${err.message}`;
        }

        trackFileAccess(name, args);

        await runPostHooks(name, args, result);

        // Emit tool output
        const lines = result.split('\n');
        const maxLines = 12;
        const outputPreview = lines.slice(0, maxLines).join('\n')
          + (lines.length > maxLines ? `\n... ${lines.length - maxLines} more lines` : '');
        emit(EventType.TOOL_OUTPUT, {
          content: outputPreview,
          lineCount: lines.length,
          truncated: lines.length > maxLines,
        });

        // Completion indicator
        const failed = result.startsWith('Error:') || result.startsWith('Tool error:') || result.startsWith('Blocked:');
        emit(EventType.TOOL_DONE, {
          success: !failed,
          summary: failed ? result.split('\n')[0] : '',
        });

        // Emit task updates for task-related tools
        if (['TaskCreate', 'TaskUpdate', 'TaskList'].includes(name)) {
          const { tasks: allTasks, completed, total } = getTasks();
          emit(EventType.TASK_UPDATE, { tasks: allTasks, completed, total });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name,
          content: result,
        });
      }
    }
  }

  function getMessages() {
    return messages;
  }

  function loadMessages(saved) {
    messages.length = 0;
    messages.push(...saved);
  }

  return { send, getMessages, loadMessages };
}

function getToolDetail(name, args) {
  switch (name) {
    case 'Bash': return args.command;
    case 'Read': return args.file_path;
    case 'Write': return args.file_path;
    case 'Edit': return args.file_path;
    case 'Grep': return args.pattern;
    case 'Glob': return args.pattern;
    case 'Agent': return args.description || args.prompt?.slice(0, 60);
    case 'SendMessage': return `-> ${args.to}`;
    case 'WebSearch': return args.query;
    case 'WebFetch': return args.url;
    default: return '';
  }
}

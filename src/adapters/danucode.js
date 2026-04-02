// Danucode Native Adapter
// Wraps the existing createConversation loop for use in the console server.

import { createConversation, getFileAccessCounts } from '../loop.js';
import { handleCommand, setConversationRef } from '../commands.js';
import { setPermissionHandler } from '../permissions.js';
import { estimateTokens } from '../context.js';
import { getCurrentMode, getModeConfig } from '../modes.js';
import { getConfig } from '../api.js';
import { addToHistory } from '../history.js';

export const meta = {
  id: 'danucode',
  name: 'Danucode',
  supervision: 'deep',
  description: 'Native Danucode agent with deep supervision — every tool call requires approval.',
};

export function createSession(tabId, cwd, config) {
  const conversation = createConversation(tabId);
  return {
    id: tabId,
    backend: 'danucode',
    supervision: 'deep',
    conversation,
    abort: { current: null },
    busy: false,
    cwd,
  };
}

export async function sendMessage(session, message, permissionHandler) {
  setConversationRef(session.conversation);
  if (permissionHandler) {
    setPermissionHandler(permissionHandler);
  }

  const controller = new AbortController();
  session.abort.current = controller;
  session.busy = true;

  try {
    // Check if it's a slash command first
    const handled = await handleCommand(message, session.conversation);
    if (!handled) {
      await session.conversation.send(message, null, controller.signal);
    }
    addToHistory(message, session.cwd, session.id);
  } finally {
    session.abort.current = null;
    session.busy = false;
  }
}

export function stopSession(session) {
  if (session.abort.current) {
    session.abort.current.abort();
    session.abort.current = null;
  }
}

export function destroySession(session) {
  stopSession(session);
  session.conversation = null;
}

export function getStatus(session, cwd) {
  const config = getConfig() || {};
  const mode = getCurrentMode();
  const modeConfig = getModeConfig();
  const messages = session.conversation ? session.conversation.getMessages() : [];
  const tokenEstimate = messages.length > 0 ? estimateTokens(messages) : 0;
  const fileAccess = getFileAccessCounts();

  return {
    model: config.model || 'unknown',
    provider: detectProvider(config),
    mode,
    modeName: modeConfig?.name || mode,
    tokenEstimate,
    maxTokens: config.max_context_tokens || 64000,
    shellAllowed: !modeConfig?.allowedTools || modeConfig.allowedTools.has('Bash'),
    editAllowed: !modeConfig?.allowedTools || modeConfig.allowedTools.has('Edit'),
    filesEdited: fileAccess.filter(f => f.tools.includes('Write') || f.tools.includes('Edit')).length,
  };
}

function detectProvider(config) {
  const baseUrl = (config.base_url || '').toLowerCase();
  if (baseUrl.includes('anthropic.com')) return 'anthropic';
  if (baseUrl.includes('openai.com')) return 'openai';
  if (config.provider) return config.provider;
  if (config.api_key && config.api_key !== 'none') return 'openai-compatible';
  return 'local';
}

// core/agent.js — The main SDK entry point.
// Wraps the conversation loop, emits structured events via EventEmitter.
// Zero terminal dependencies.

import { EventEmitter } from 'node:events';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { EventType } from './events.js';

export class Agent extends EventEmitter {
  #conversation = null;
  #options = null;

  constructor(options = {}) {
    super();
    this.#options = options;
  }

  static create(options) {
    return new Agent(options);
  }

  async init() {
    // Lazy-load core modules to avoid circular deps at import time
    const { loadConfig, getConfig, setModel } = await import('./api.js');
    const { createConversation } = await import('./loop.js');
    const { buildSystemPrompt } = await import('./system-prompt.js');
    const { initMcpServers } = await import('./mcp.js');
    const { loadCustomTools } = await import('./custom-tools.js');
    const { initLsp } = await import('./lsp.js');

    // Load config
    if (this.#options.configPath) {
      loadConfig(this.#options.configPath);
    } else {
      try { loadConfig(); } catch { /* config may be set via options */ }
    }

    if (this.#options.model) setModel(this.#options.model);

    // Initialize integrations
    await initMcpServers();
    await loadCustomTools();
    await initLsp();

    // Create conversation with this agent as the event emitter
    this.#conversation = createConversation('sdk', this);

    return this;
  }

  async run(message, options = {}) {
    if (!this.#conversation) await this.init();
    const signal = options.signal || null;
    await this.#conversation.send(message, null, signal);
    return this.getMessages();
  }

  async send(message, options = {}) {
    if (!this.#conversation) await this.init();
    const signal = options.signal || null;
    await this.#conversation.send(message, null, signal);
  }

  stop() {
    this.emit(EventType.INTERRUPTED, { reason: 'Agent.stop() called' });
  }

  getMessages() {
    return this.#conversation ? this.#conversation.getMessages() : [];
  }

  getTokenEstimate() {
    // Lazy import to avoid circular
    const messages = this.getMessages();
    let total = 0;
    for (const m of messages) {
      let content = '';
      if (typeof m.content === 'string') content = m.content;
      if (m.tool_calls) content += JSON.stringify(m.tool_calls);
      total += content.length;
    }
    return Math.ceil(total / 4);
  }

  save(name) {
    const dir = join(homedir(), '.danu', 'sessions');
    mkdirSync(dir, { recursive: true });
    const data = { messages: this.getMessages(), savedAt: new Date().toISOString(), cwd: process.cwd() };
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
  }

  load(name) {
    const data = JSON.parse(readFileSync(join(homedir(), '.danu', 'sessions', `${name}.json`), 'utf-8'));
    if (this.#conversation && Array.isArray(data.messages)) {
      this.#conversation.loadMessages(data.messages);
    }
  }

  clear() {
    if (this.#conversation) {
      this.#conversation.loadMessages([]);
    }
  }

  async compact() {
    if (!this.#conversation) return;
    const { forceCompact } = await import('./context.js');
    const messages = this.#conversation.getMessages();
    const compacted = await forceCompact(messages);
    if (compacted !== messages) {
      this.#conversation.loadMessages(compacted);
    }
  }
}

export function createAgent(options) {
  return Agent.create(options);
}

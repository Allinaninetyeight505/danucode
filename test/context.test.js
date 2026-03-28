import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, pruneToolOutputs } from '../src/context.js';

describe('Token estimation', () => {
  it('estimates tokens from message content', () => {
    const messages = [
      { role: 'system', content: 'You are a helper.' },
      { role: 'user', content: 'Hello world' },
    ];
    const tokens = estimateTokens(messages);
    assert.ok(tokens > 0);
    assert.ok(tokens < 100);
  });

  it('includes tool_calls in estimation', () => {
    const messages = [
      { role: 'assistant', content: null, tool_calls: [{ function: { name: 'Bash', arguments: '{"command":"ls"}' } }] },
    ];
    const tokens = estimateTokens(messages);
    assert.ok(tokens > 0);
  });
});

describe('Tool output pruning', () => {
  it('returns messages unchanged if too few', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user',
      content: 'short',
    }));
    const result = pruneToolOutputs(messages);
    assert.equal(result.length, 10);
  });

  it('truncates old tool outputs in long conversations', () => {
    const messages = [
      { role: 'system', content: 'system' },
      ...Array.from({ length: 20 }, (_, i) => ({
        role: 'tool',
        name: 'Read',
        content: 'x'.repeat(500),
      })),
    ];
    const result = pruneToolOutputs(messages);
    // Old messages (not last 6) should be truncated
    const oldToolMsg = result[1];
    assert.ok(oldToolMsg.content.length < 500);
    assert.match(oldToolMsg.content, /pruned/);

    // Recent messages should be intact
    const recentMsg = result[result.length - 1];
    assert.equal(recentMsg.content.length, 500);
  });

  it('preserves system prompt and recent messages', () => {
    const messages = [
      { role: 'system', content: 'system prompt here' },
      ...Array.from({ length: 20 }, (_, i) => ({
        role: 'tool',
        name: 'Bash',
        content: 'output '.repeat(100),
      })),
    ];
    const result = pruneToolOutputs(messages);
    assert.equal(result[0].content, 'system prompt here');
    assert.equal(result[0].role, 'system');
  });
});

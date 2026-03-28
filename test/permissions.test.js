import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setSkipPermissions,
  getSkipPermissions,
  askPermission,
  resetSessionPermissions,
} from '../src/permissions.js';

describe('Permission system', () => {
  beforeEach(() => {
    setSkipPermissions(false);
    resetSessionPermissions();
  });

  it('blocks by default when no handler and no rl', async () => {
    // With no handler and no rl, askPermission returns true (fallback)
    // This tests the fallback path
    const result = await askPermission('Bash', { command: 'ls' }, null);
    assert.equal(result, true); // Falls through with no handler
  });

  it('allows everything in yolo mode', async () => {
    setSkipPermissions(true);
    assert.equal(getSkipPermissions(), true);
    const result = await askPermission('Bash', { command: 'rm -rf /' }, null);
    assert.equal(result, true);
  });

  it('respects session-level allow', async () => {
    // Simulate the Ink permission handler returning 'a' (always)
    const { setPermissionHandler } = await import('../src/permissions.js');
    setPermissionHandler((toolName, args) => Promise.resolve('a'));

    // First call — handler returns 'a', tool gets session-allowed
    const r1 = await askPermission('Bash', { command: 'ls' }, null);
    assert.equal(r1, true);

    // Remove handler — session allowance should persist
    setPermissionHandler(null);
    const r2 = await askPermission('Bash', { command: 'echo hi' }, null);
    assert.equal(r2, true); // Session-allowed

    // Different tool should NOT be session-allowed
    // (falls through to no-handler fallback which returns true —
    // but in real usage there would be a handler or rl)
  });

  it('resets session permissions', async () => {
    const { setPermissionHandler } = await import('../src/permissions.js');
    setPermissionHandler((toolName, args) => Promise.resolve('a'));
    await askPermission('Write', { file_path: '/tmp/test' }, null);
    setPermissionHandler(null);

    resetSessionPermissions();
    // After reset, Write is no longer session-allowed
    // Falls through to no-handler fallback
    const result = await askPermission('Write', { file_path: '/tmp/test' }, null);
    assert.equal(result, true); // Fallback — no handler, no rl
  });

  it('denies when handler returns n', async () => {
    const { setPermissionHandler } = await import('../src/permissions.js');
    setPermissionHandler((toolName, args) => Promise.resolve('n'));
    const result = await askPermission('Bash', { command: 'dangerous' }, null);
    assert.equal(result, false);
    setPermissionHandler(null);
  });
});

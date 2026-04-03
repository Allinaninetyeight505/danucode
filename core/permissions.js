// core/permissions.js — Permission policy engine.
// No prompts, no terminal output. Just decision logic.
// The CLI wraps this with interactive prompts (cli/permissions-prompt.js).
// An SDK consumer wraps it with their own logic.

let skipPermissions = false;
export const sessionAllowed = new Set();

const NEEDS_PERMISSION = new Set(['Bash', 'Write', 'Edit']);

export function setSkipPermissions(value) {
  skipPermissions = value;
}

export function getSkipPermissions() {
  return skipPermissions;
}

export function checkPermission(toolName, args, policy) {
  if (skipPermissions) return { allowed: true };
  if (policy === 'yolo') return { allowed: true };
  if (sessionAllowed.has(toolName)) return { allowed: true };
  if (!NEEDS_PERMISSION.has(toolName)) return { allowed: true };
  return { allowed: false, needsApproval: true, toolName, args };
}

export function resetSessionPermissions() {
  sessionAllowed.clear();
}

// Backward-compatible askPermission for non-interactive use (SDK).
// If a permissionFn is provided (SDK consumer), use it.
// Otherwise, deny by default (fail closed).
export async function askPermission(toolName, args, rl, permissionFn) {
  if (skipPermissions) return true;
  if (sessionAllowed.has(toolName)) return true;
  if (!NEEDS_PERMISSION.has(toolName)) return true;

  if (permissionFn) {
    const result = await permissionFn(toolName, args);
    if (result === 'a' || result === 'always' || result === true) {
      if (result === 'a' || result === 'always') sessionAllowed.add(toolName);
      return typeof result === 'boolean' ? result : true;
    }
    return result === 'y';
  }

  // No handler — deny (fail closed)
  return false;
}

// For compatibility: allow setting a handler that the askPermission falls back to
let permissionHandler = null;

export function setPermissionHandler(handler) {
  permissionHandler = handler;
}

export async function askPermissionCompat(toolName, args, rl) {
  if (skipPermissions) return true;
  if (sessionAllowed.has(toolName)) return true;
  if (!NEEDS_PERMISSION.has(toolName)) return true;

  if (permissionHandler) {
    const answer = await permissionHandler(toolName, args);
    if (answer === 'a' || answer === 'always') {
      sessionAllowed.add(toolName);
      return true;
    }
    return answer === 'y';
  }

  // No handler and no rl — deny (fail closed)
  return false;
}

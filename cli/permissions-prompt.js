import chalk from 'chalk';
import { checkPermission, getSkipPermissions, sessionAllowed } from '../core/permissions.js';

let permissionHandler = null;

export function setPermissionHandler(handler) {
  permissionHandler = handler;
}

export async function askPermission(toolName, args, rl) {
  if (getSkipPermissions()) return true;

  const result = checkPermission(toolName, args);
  if (result.allowed) return true;

  // Ink-based handler
  if (permissionHandler) {
    const answer = await permissionHandler(toolName, args);
    if (answer === 'a' || answer === 'always') {
      sessionAllowed.add(toolName);
      return true;
    }
    return answer === 'y';
  }

  // Readline fallback
  if (rl) {
    let detail;
    switch (toolName) {
      case 'Bash': detail = args.command; break;
      case 'Write': detail = args.file_path; break;
      case 'Edit': detail = args.file_path; break;
      default: detail = `${toolName} operation`;
    }
    console.log(chalk.dim(`  ${detail}`));
    const answer = await rl.question(chalk.yellow('  Allow? ') + chalk.dim('[y/n/a(lways)] '));
    const choice = answer.trim().toLowerCase();
    if (choice === 'a' || choice === 'always') {
      sessionAllowed.add(toolName);
      return true;
    }
    return choice.startsWith('y');
  }

  // No handler and no rl — deny (fail closed)
  console.log(chalk.red('  Denied: no permission handler available'));
  return false;
}

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';

export function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe', cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

export function createWorktree() {
  if (!isGitRepo()) return null;

  const branch = `danu-agent-${Date.now()}`;
  const dir = resolve(process.cwd(), '..', `.danu-worktree-${branch}`);

  try {
    execSync(`git worktree add -b ${branch} "${dir}" HEAD`, {
      stdio: 'pipe',
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    console.log(chalk.dim(`    Worktree created: ${dir} (branch: ${branch})`));
    return { dir, branch };
  } catch (err) {
    console.log(chalk.dim(`    Worktree creation failed: ${err.message}`));
    return null;
  }
}

export function removeWorktree(worktree) {
  if (!worktree) return;
  try {
    execSync(`git worktree remove "${worktree.dir}" --force`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    // Delete the temporary branch
    execSync(`git branch -D ${worktree.branch}`, {
      stdio: 'pipe',
      cwd: process.cwd(),
    });
    console.log(chalk.dim(`    Worktree cleaned up`));
  } catch {
    // Best effort cleanup
  }
}

export function getWorktreeChanges(worktree) {
  if (!worktree) return null;
  try {
    const diff = execSync('git diff HEAD', {
      encoding: 'utf-8',
      cwd: worktree.dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return diff || null;
  } catch {
    return null;
  }
}

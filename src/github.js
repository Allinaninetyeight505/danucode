import { execSync } from 'node:child_process';
import chalk from 'chalk';

let ghAvailable = null;

function checkGh() {
  if (ghAvailable !== null) return ghAvailable;
  try {
    execSync('gh --version', { stdio: 'pipe' });
    ghAvailable = true;
  } catch {
    ghAvailable = false;
  }
  return ghAvailable;
}

export function isGhAvailable() {
  return checkGh();
}

export function ghExec(args, options = {}) {
  if (!checkGh()) return 'GitHub CLI (gh) not installed. Install from https://cli.github.com/';

  try {
    return execSync(`gh ${args}`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (err) {
    return err.stderr?.trim() || err.stdout?.trim() || `gh command failed: ${err.message}`;
  }
}

// Get PR details
export function getPR(prNumber) {
  return ghExec(`pr view ${prNumber} --json number,title,body,state,author,additions,deletions,changedFiles,headRefName,baseRefName,reviewDecision,comments`);
}

// List PRs
export function listPRs(state = 'open') {
  return ghExec(`pr list --state ${state} --json number,title,author,headRefName,updatedAt --limit 20`);
}

// Get PR diff
export function getPRDiff(prNumber) {
  return ghExec(`pr diff ${prNumber}`);
}

// Get PR comments
export function getPRComments(prNumber) {
  return ghExec(`pr view ${prNumber} --comments`);
}

// Create PR
export function createPR(title, body, base = '') {
  const baseFlag = base ? `--base ${base}` : '';
  return ghExec(`pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" ${baseFlag}`);
}

// Get issue details
export function getIssue(issueNumber) {
  return ghExec(`issue view ${issueNumber} --json number,title,body,state,author,labels,assignees,comments`);
}

// List issues
export function listIssues(state = 'open') {
  return ghExec(`issue list --state ${state} --json number,title,author,labels,updatedAt --limit 20`);
}

// Get repo info
export function getRepoInfo() {
  return ghExec('repo view --json name,owner,description,defaultBranchRef');
}

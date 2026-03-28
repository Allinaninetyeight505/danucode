import chalk from 'chalk';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';

let planModeActive = false;
let planFilePath = null;

// Tools allowed in plan mode (read-only + search + web)
const PLAN_MODE_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Agent',
]);

// Tools the LLM can call to manage plan mode
const PLAN_TOOLS = ['ExitPlanMode'];

export function isPlanMode() {
  return planModeActive;
}

export function getPlanFilePath() {
  return planFilePath;
}

export function isToolAllowedInPlanMode(toolName) {
  if (!planModeActive) return true;
  // Always allow the plan mode control tools
  if (PLAN_TOOLS.includes(toolName)) return true;
  // Allow Write/Edit ONLY to the plan file
  if (toolName === 'Write' || toolName === 'Edit') return false;
  return PLAN_MODE_TOOLS.has(toolName);
}

export function enterPlanMode() {
  planModeActive = true;

  // Generate plan file name
  const adjectives = ['woolly', 'swift', 'bright', 'quiet', 'bold', 'keen', 'calm', 'warm'];
  const nouns = ['kiwi', 'tui', 'fern', 'pohutukawa', 'kauri', 'weta', 'paua', 'morepork'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const id = randomBytes(3).toString('hex');

  const plansDir = resolve(process.cwd(), '.danu');
  mkdirSync(plansDir, { recursive: true });
  planFilePath = join(plansDir, `plan-${adj}-${noun}-${id}.md`);

  // Create empty plan file
  writeFileSync(planFilePath, `# Plan\n\n`, 'utf-8');

  console.log('');
  console.log(chalk.magenta.bold('  Entered plan mode'));
  console.log(chalk.dim(`  Plan file: ${planFilePath}`));
  console.log(chalk.dim('  Read-only tools only. Write your plan, then call ExitPlanMode.'));
  console.log('');

  return planFilePath;
}

export function exitPlanMode() {
  if (!planModeActive) return null;

  planModeActive = false;

  // Read the plan file content
  let planContent = '';
  if (planFilePath && existsSync(planFilePath)) {
    planContent = readFileSync(planFilePath, 'utf-8');
  }

  console.log('');
  console.log(chalk.green.bold('  Exited plan mode'));
  console.log(chalk.dim('  You can now proceed with implementation.'));
  console.log('');

  const path = planFilePath;
  planFilePath = null;
  return { path, content: planContent };
}

// System prompt addition when plan mode is active
export function getPlanModePrompt() {
  if (!planModeActive) return '';

  return `

## Plan Mode Active

Plan mode is active. The user wants you to PLAN before executing. You MUST NOT make any edits, run any non-readonly tools, or otherwise make changes. You can only use: Read, Grep, Glob, WebSearch, WebFetch, Agent.

Your workflow in plan mode:
1. Understand the request by exploring the codebase (Read, Grep, Glob)
2. Research if needed (WebSearch, WebFetch)
3. Design your implementation approach
4. Write your plan to the plan file at: ${planFilePath}
5. When your plan is ready, call ExitPlanMode to present it for user approval

Plan file: ${planFilePath}
The plan file already exists and is ready to write to. Use the Write tool to write your plan there — it is the ONLY file you may write to in plan mode. Do NOT try to create directories or use Bash — just call Write directly with the plan file path.

Be thorough: identify files to modify, functions to change, edge cases to handle. A good plan prevents wasted effort.`;
}

// ExitPlanMode tool definition for the LLM
export const exitPlanModeDefinition = {
  type: 'function',
  function: {
    name: 'ExitPlanMode',
    description: 'Call this when you have finished writing your plan and are ready for user approval. The user will review your plan before you proceed with implementation.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

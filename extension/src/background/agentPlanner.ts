/**
 * PrivAI — Agent Planner
 *
 * Analyzes the user task and current page state to determine
 * whether the task is complete or what the next step should be.
 * Maintains a lightweight plan that can be updated based on observations.
 */

import { StepHistoryEntry, PageState, DOMElement } from '../types';

export interface PlanStep {
  description: string;
  completed: boolean;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
  currentStepIndex: number;
  isComplete: boolean;
}

/**
 * Determine if a task is a simple informational query
 * that can be answered by reading the page (no actions needed).
 */
export function isReadOnlyTask(task: string): boolean {
  const lower = task.toLowerCase().trim();
  const readPatterns = [
    /^what\s+(is|are|does|do|was|were)/,
    /^(tell|show|explain|describe|summarize|read)/,
    /^(who|where|when|why|how)\s/,
    /^(find|locate|look\s+for|search\s+for)\s+(the|a|an)\s/,
    /^(list|enumerate|count)/,
    /\?$/,
    /about\s+this\s+page/,
    /what.*page/,
    /what.*say/,
    /what.*contain/,
  ];

  return readPatterns.some((p) => p.test(lower));
}

/**
 * Determine if a task is a greeting / meta query.
 */
export function isGreeting(task: string): boolean {
  const lower = task.toLowerCase().trim();
  return /^(hi+|hello+|hey+|hola|greetings?|ping|test|who are you|what can you do)\b/i.test(lower);
}

/**
 * Determine if the task appears to be complete based on history.
 */
export function isTaskLikelyComplete(
  task: string,
  history: StepHistoryEntry[],
  currentPageState?: PageState,
): boolean {
  if (history.length === 0) return false;

  const lastStep = history[history.length - 1];

  // If the last action was a finish action or read_page
  if (lastStep.action.action === 'finish' || lastStep.action.action === 'read_page') {
    return true;
  }

  // If we've had a successful navigation and the task was to navigate
  const lower = task.toLowerCase();
  if (lower.includes('go to') || lower.includes('navigate to') || lower.includes('open')) {
    if (lastStep.action.action === 'navigate' && lastStep.success) return true;
  }

  // If we searched and found results (typed + results loaded)
  if (lower.includes('search')) {
    const hasTyped = history.some((h) => h.action.action === 'type' && h.success);
    if (hasTyped && lastStep.success) return true;
  }

  return false;
}

/**
 * Build a concise step history summary for the LLM context.
 */
export function buildStepHistorySummary(history: StepHistoryEntry[]): string {
  if (history.length === 0) return '';

  const lines = ['PREVIOUS ACTIONS:'];
  for (const step of history.slice(-5)) { // Last 5 steps only
    const status = step.success ? '✓' : '✗';
    let desc = `${status} Step ${step.stepIndex}: ${step.action.action}`;

    if (step.action.target) desc += ` target="${step.action.target}"`;
    if (step.action.text) desc += ` text="${step.action.text.slice(0, 50)}"`;
    if (step.action.url) desc += ` url="${step.action.url}"`;
    if (step.action.direction) desc += ` ${step.action.direction}`;
    if (step.error) desc += ` ERROR: ${step.error.slice(0, 100)}`;
    if (step.observation) desc += ` → ${step.observation.slice(0, 100)}`;

    lines.push(desc);
  }

  return lines.join('\n');
}

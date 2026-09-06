/**
 * PrivAI — Agent Validator
 *
 * Validates whether an action succeeded by comparing page state before and after.
 * Detects errors, unexpected navigations, and determines whether retry is needed.
 */

import { Action, PageState, StepHistoryEntry } from '../types';

export interface ValidationResult {
  success: boolean;
  /** What changed on the page after the action */
  observation: string;
  /** Whether the agent should retry this action */
  shouldRetry: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Validate an action by comparing page state before and after.
 */
export function validateActionResult(
  action: Action,
  beforeState: PageState | undefined,
  afterState: PageState | undefined,
  executionError?: string,
): ValidationResult {
  // If there was an execution error
  if (executionError) {
    const shouldRetry = isRetryableError(executionError);
    return {
      success: false,
      observation: `Action failed: ${executionError}`,
      shouldRetry,
      error: executionError,
    };
  }

  if (!beforeState || !afterState) {
    return {
      success: true,
      observation: 'Action executed (page state unavailable for comparison)',
      shouldRetry: false,
    };
  }

  // Analyze what changed
  const changes: string[] = [];

  // URL change
  if (beforeState.url !== afterState.url) {
    changes.push(`Page navigated to ${afterState.url}`);
  }

  // Title change
  if (beforeState.title !== afterState.title) {
    changes.push(`Page title changed to "${afterState.title}"`);
  }

  // Scroll change
  if (Math.abs(afterState.scrollY - beforeState.scrollY) > 50) {
    const dir = afterState.scrollY > beforeState.scrollY ? 'down' : 'up';
    changes.push(`Page scrolled ${dir} by ${Math.abs(afterState.scrollY - beforeState.scrollY)}px`);
  }

  // Page height change (new content loaded)
  if (Math.abs(afterState.totalHeight - beforeState.totalHeight) > 100) {
    changes.push(`Page content changed (height: ${beforeState.totalHeight} → ${afterState.totalHeight})`);
  }

  // Action-specific validation
  switch (action.action) {
    case 'navigate':
      if (beforeState.url === afterState.url) {
        return {
          success: false,
          observation: 'Navigation did not change the URL',
          shouldRetry: true,
        };
      }
      break;

    case 'scroll':
    case 'scroll_to_top':
    case 'scroll_to_bottom':
    case 'scroll_to_element':
      if (beforeState.scrollY === afterState.scrollY) {
        // Might be at top/bottom already
        const atTop = afterState.scrollY === 0;
        const atBottom = afterState.scrollY + afterState.viewportHeight >= afterState.totalHeight - 10;
        if (atTop || atBottom) {
          changes.push('Already at page boundary');
        } else {
          return {
            success: false,
            observation: 'Scroll did not change position',
            shouldRetry: false,
          };
        }
      }
      break;

    case 'click':
      // Click is valid if anything changed or if page is the same (maybe a toggle)
      break;

    case 'type':
      // Type is valid as long as no error
      break;
  }

  const observation = changes.length > 0
    ? changes.join('; ')
    : 'Action executed successfully (no visible state change)';

  return {
    success: true,
    observation,
    shouldRetry: false,
  };
}

/**
 * Determine if an error is retryable (element not found, stale, etc.)
 */
function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    /not found/i,
    /stale/i,
    /detached/i,
    /could not connect/i,
    /timeout/i,
    /please refresh/i,
  ];
  return retryablePatterns.some((p) => p.test(error));
}

/**
 * Build a user-friendly status message for what the agent is doing.
 */
export function getStatusEmoji(agentState: string): string {
  switch (agentState) {
    case 'PLANNING': return '🧠 Planning...';
    case 'CAPTURING': return '📸 Capturing page...';
    case 'PERCEIVING': return '👀 Reading page...';
    case 'PRIVACY_SCANNING': return '🔐 Privacy check...';
    case 'SENDING': return '📡 Consulting AI...';
    case 'REASONING': return '🤔 Reasoning...';
    case 'VALIDATING': return '✅ Validating result...';
    case 'EXECUTING': return '⚡ Executing action...';
    case 'WAITING_CONFIRMATION': return '⏳ Waiting for confirmation...';
    case 'COMPLETED': return '✅ Done';
    case 'ERROR': return '⚠️ Error';
    case 'NETWORK_BLOCKED': return '🛑 Blocked by privacy firewall';
    default: return '🤖 Working...';
  }
}

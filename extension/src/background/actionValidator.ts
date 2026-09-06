/**
 * PrivAI — Enhanced Action Validator with Risk Classification
 *
 * Validates actions before execution and classifies them by risk level.
 * High-risk actions require user confirmation before proceeding.
 */

import { Action, DOMElement, ActionRiskLevel, ConfirmationRequest } from '../types';

export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionValidationError';
  }
}

/**
 * Classify an action's risk level.
 */
export function classifyActionRisk(action: Action, domElements: DOMElement[] = []): ActionRiskLevel {
  switch (action.action) {
    // Always safe
    case 'read_page':
    case 'scroll':
    case 'scroll_to_top':
    case 'scroll_to_bottom':
    case 'scroll_to_element':
    case 'wait':
    case 'wait_for_element':
    case 'extract':
    case 'go_back':
    case 'press_key':
      return 'low';

    case 'navigate': {
      if (!action.url) return 'low';
      const url = action.url.toLowerCase();
      // High risk: payment, auth, or account URLs
      if (/pay|checkout|billing|purchase|order|confirm|delete|remove|transfer/.test(url)) {
        return 'high';
      }
      // Medium risk: login, settings URLs
      if (/login|signin|signup|register|settings|admin|account/.test(url)) {
        return 'medium';
      }
      return 'medium';
    }

    case 'click': {
      if (!action.target) return 'low';
      const targetEl = findElement(action.target, domElements);
      if (!targetEl) return 'medium';

      const textLow = (targetEl.text || '').toLowerCase();
      const labelLow = (targetEl.label || '').toLowerCase();
      const combined = `${textLow} ${labelLow}`;

      // High risk: purchase, delete, send, submit financial, irreversible
      if (/buy|purchase|pay|checkout|delete|remove|confirm.*order|place.*order|send.*email|send.*message|transfer|unsubscribe/.test(combined)) {
        return 'high';
      }
      // Medium risk: submit, login, register, save, form submission
      if (/submit|login|sign.*in|sign.*up|register|create.*account|save|upload|change.*password|update.*settings/.test(combined)) {
        return 'medium';
      }
      return 'low';
    }

    case 'type': {
      if (!action.target) return 'medium';
      const targetEl = findElement(action.target, domElements);
      if (!targetEl) return 'medium';

      const fieldDesc = `${(targetEl.input_type || '')} ${(targetEl.label || '')} ${(targetEl.placeholder || '')} ${(targetEl.element_id || '')}`.toLowerCase();

      // High risk: typing into sensitive fields
      if (/password|secret|card|cvv|ssn|pin|otp|verification/.test(fieldDesc)) {
        return 'high';
      }
      // Medium risk: email, name, address, phone fields
      if (/email|name|address|phone|tel|mobile/.test(fieldDesc)) {
        return 'medium';
      }
      return 'low';
    }

    case 'select':
    case 'check':
    case 'uncheck':
      return 'low';

    case 'finish':
    case 'ask_user':
      return 'low';

    default:
      return 'medium';
  }
}

/**
 * Build a human-readable confirmation request for high-risk actions.
 */
export function buildConfirmationRequest(action: Action, riskLevel: ActionRiskLevel, domElements: DOMElement[]): ConfirmationRequest {
  let description = '';
  let reason = '';

  switch (action.action) {
    case 'click': {
      const el = findElement(action.target || '', domElements);
      const label = el?.text || el?.label || action.target || 'unknown element';
      description = `Click "${label}"`;
      reason = 'This button may trigger a significant action (purchase, deletion, or submission).';
      break;
    }
    case 'type': {
      const el = findElement(action.target || '', domElements);
      const field = el?.label || el?.placeholder || action.target || 'unknown field';
      description = `Type into "${field}"`;
      reason = 'This field appears to accept sensitive information.';
      break;
    }
    case 'navigate':
      description = `Navigate to ${action.url}`;
      reason = 'This URL may lead to a sensitive page (payment, login, or account management).';
      break;
    default:
      description = `Execute ${action.action}`;
      reason = 'This action has been classified as potentially risky.';
  }

  return { action, riskLevel, reason, description };
}

function findElement(target: string, elements: DOMElement[]): DOMElement | undefined {
  return elements.find(
    (el) =>
      el.element_id === target ||
      el.id === target ||
      (el.text && el.text.trim().toLowerCase() === target.toLowerCase()) ||
      (el.label && el.label.trim().toLowerCase() === target.toLowerCase()) ||
      (el.placeholder && el.placeholder.trim().toLowerCase() === target.toLowerCase())
  );
}

/**
 * Validate an action for safety before execution.
 * Throws ActionValidationError if the action is unsafe.
 */
export function validateAction(action: Action, domElements: DOMElement[]): void {
  // Disallow javascript execution everywhere
  if (action.url && action.url.toLowerCase().startsWith('javascript:')) {
    throw new ActionValidationError('Arbitrary JavaScript execution is blocked.');
  }
  if (action.text && (action.text.includes('<script') || action.text.includes('javascript:'))) {
    throw new ActionValidationError('Arbitrary JavaScript execution is blocked.');
  }

  switch (action.action) {
    case 'click':
    case 'type':
      if (!action.target) {
        throw new ActionValidationError(`${action.action} requires a target`);
      }
      if (action.action === 'type' && (action.text === undefined || action.text === null)) {
        throw new ActionValidationError('Type action requires text parameter');
      }
      
      const targetQuery = action.target.toLowerCase();
      const targetEl = domElements.find(
        (el) =>
          el.element_id === action.target ||
          el.id === action.target ||
          (el.highlightIndex !== undefined && String(el.highlightIndex) === action.target) ||
          (el.text && el.text.trim().toLowerCase() === targetQuery) ||
          (el.label && el.label.trim().toLowerCase() === targetQuery) ||
          (el.placeholder && el.placeholder.trim().toLowerCase() === targetQuery)
      );
      if (!targetEl) {
        throw new ActionValidationError(`Target element "${action.target}" does not exist in the DOM.`);
      }
      // Normalize target to canonical element_id for safe executor dispatch
      action.target = targetEl.element_id;

      if (!targetEl.visible) {
        throw new ActionValidationError(`Target element "${action.target}" is not visible.`);
      }
      
      if (action.action === 'type' && targetEl.input_type === 'password') {
        throw new ActionValidationError(`Typing into password fields is prohibited by safety policy.`);
      }
      break;

    case 'scroll':
      if (!action.direction) {
        throw new ActionValidationError('Scroll requires a direction');
      }
      if (action.amount && (action.amount < 0 || action.amount > 5000)) {
        throw new ActionValidationError('Scroll amount must be between 0 and 5000 pixels.');
      }
      break;

    case 'navigate':
      if (!action.url) {
        throw new ActionValidationError('Navigate requires a URL');
      }
      if (!action.url.startsWith('http://') && !action.url.startsWith('https://')) {
        throw new ActionValidationError('Navigation URL must use http:// or https://');
      }
      break;

    case 'select':
      if (!action.target) throw new ActionValidationError('Select requires a target');
      if (!action.value) throw new ActionValidationError('Select requires a value');
      break;

    case 'check':
    case 'uncheck':
      if (!action.target) throw new ActionValidationError(`${action.action} requires a target`);
      break;

    case 'scroll_to_element':
      if (!action.target) throw new ActionValidationError('scroll_to_element requires a target');
      break;

    case 'press_key':
      if (!action.key) throw new ActionValidationError('press_key requires a key');
      break;

    case 'go_back':
    case 'wait':
    case 'wait_for_element':
    case 'read_page':
    case 'scroll_to_top':
    case 'scroll_to_bottom':
    case 'extract':
    case 'finish':
    case 'ask_user':
      // Safe by default
      break;
      
    default:
      throw new ActionValidationError(`Unknown action type: ${action.action}`);
  }
}

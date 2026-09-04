import { Action, DOMElement } from '../types';

export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionValidationError';
  }
}

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
      
      const targetEl = domElements.find(el => el.element_id === action.target);
      if (!targetEl) {
        throw new ActionValidationError(`Target element ${action.target} does not exist in the DOM.`);
      }
      if (!targetEl.visible) {
        throw new ActionValidationError(`Target element ${action.target} is not visible.`);
      }
      if (!targetEl.interactive && action.action === 'click' && targetEl.tag !== 'input' && targetEl.tag !== 'textarea') {
        // sometimes VLMs click weird things, but strictly we could enforce interactiveness.
        // We'll allow clicking on inputs even if not marked interactive.
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
      
    case 'go_back':
    case 'wait':
    case 'read_page':
      // Safe by default
      break;
      
    default:
      throw new ActionValidationError(`Unknown action type: ${action.action}`);
  }
}

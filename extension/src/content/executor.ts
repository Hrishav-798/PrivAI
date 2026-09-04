import { Action } from '../types';
import { registry } from './elementRegistry';

export async function executeAction(action: Action): Promise<void> {
  switch (action.action) {
    case 'click':
      if (!action.target) throw new Error('Click requires a target');
      executeClick(action.target);
      break;
    case 'type':
      if (!action.target) throw new Error('Type requires a target');
      if (action.text === undefined) throw new Error('Type requires text');
      executeType(action.target, action.text);
      break;
    case 'scroll':
      executeScroll(action.direction || 'down', action.amount || 500);
      break;
    case 'navigate':
      if (!action.url) throw new Error('Navigate requires a url');
      executeNavigate(action.url);
      break;
    case 'go_back':
      executeBack();
      break;
    case 'wait':
    case 'read_page':
      // Do nothing in DOM, handled by agent loop
      break;
    default:
      throw new Error(`Unsupported action: ${action.action}`);
  }
}

function executeClick(id: string) {
  const el = document.querySelector(`[data-agent-id="${id}"]`);
  if (!el) throw new Error(`Target element ${id} not found`);
  
  if (el instanceof HTMLElement) {
    el.click();
  } else {
    // Fallback for non-HTMLElements that are clickable (like SVG)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
}

function executeType(id: string, text: string) {
  const el = document.querySelector(`[data-agent-id="${id}"]`);
  if (!el) throw new Error(`Target element ${id} not found`);

  // Allow only editable elements
  if (
    !(el instanceof HTMLInputElement) && 
    !(el instanceof HTMLTextAreaElement) && 
    !el.hasAttribute('contenteditable')
  ) {
    throw new Error(`Target element ${id} is not editable`);
  }

  // Prevent typing into password fields as a general safety rule unless explicitly overriden (which we won't here)
  if (el instanceof HTMLInputElement && el.type === 'password') {
    throw new Error(`Safety violation: Cannot type into password field ${id}`);
  }

  if (el instanceof HTMLElement) {
    el.focus();
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLElement && el.hasAttribute('contenteditable')) {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function executeScroll(direction: 'up'|'down'|'left'|'right', amount: number) {
  switch (direction) {
    case 'up': window.scrollBy({ top: -amount, behavior: 'smooth' }); break;
    case 'down': window.scrollBy({ top: amount, behavior: 'smooth' }); break;
    case 'left': window.scrollBy({ left: -amount, behavior: 'smooth' }); break;
    case 'right': window.scrollBy({ left: amount, behavior: 'smooth' }); break;
  }
}

function executeNavigate(url: string) {
  window.location.href = url;
}

function executeBack() {
  window.history.back();
}

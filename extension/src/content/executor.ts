import { Action } from '../types';

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
      // Handled by agent loop
      break;
    default:
      throw new Error(`Unsupported action: ${(action as any).action}`);
  }
}

/**
 * Resilient element finder: searches by data-agent-id, DOM id, name, aria-label, selector, or text.
 */
function findTargetElement(id: string): Element | null {
  if (!id) return null;

  // 1. Check data-agent-id assigned by domScanner
  let el = document.querySelector(`[data-agent-id="${id}"]`);
  if (el) return el;

  // 2. Check standard DOM id
  el = document.getElementById(id);
  if (el) return el;

  // 3. Check name attribute
  el = document.querySelector(`[name="${id}"]`);
  if (el) return el;

  // 4. Try as CSS selector if valid
  try {
    el = document.querySelector(id);
    if (el) return el;
  } catch {
    // Ignore invalid selector syntax
  }

  // 5. Match aria-label, placeholder, or title
  el = document.querySelector(`[aria-label="${id}" i], [placeholder="${id}" i], [title="${id}" i]`);
  if (el) return el;

  // 6. Substring match on data-agent-id or id
  el = document.querySelector(`[data-agent-id*="${id}"], [id*="${id}"]`);
  if (el) return el;

  // 7. Match interactive elements by text content
  const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]');
  for (const btn of buttons) {
    const text = btn.textContent ? btn.textContent.trim().toLowerCase() : '';
    if (text && text.includes(id.toLowerCase())) {
      return btn;
    }
  }

  return null;
}

function executeClick(id: string) {
  const el = findTargetElement(id);
  if (!el) throw new Error(`Target element "${id}" not found on page`);

  if (el instanceof HTMLElement) {
    el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    el.focus();
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
}

function executeType(id: string, text: string) {
  const el = findTargetElement(id);
  if (!el) throw new Error(`Target element "${id}" not found on page`);

  // Allow only editable elements
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !el.hasAttribute('contenteditable')
  ) {
    throw new Error(`Target element "${id}" is not an editable field`);
  }

  // Prevent typing into readonly fields
  if ((el as HTMLInputElement).readOnly) {
    throw new Error(`Target element "${id}" is marked readonly`);
  }

  // Prevent typing into password fields as a general safety rule
  if (el instanceof HTMLInputElement && el.type === 'password') {
    throw new Error(`Safety violation: Cannot type into password field "${id}"`);
  }

  if (el instanceof HTMLElement) {
    el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    el.focus();
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
    const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    // If typing into a search input, also dispatch Enter key and form/button submission
    const nameAttr = (el.getAttribute('name') || '').toLowerCase();
    const idAttr = (el.id || '').toLowerCase();
    const placeholderAttr = (el.getAttribute('placeholder') || '').toLowerCase();
    const isSearchField =
      (el instanceof HTMLInputElement && el.type === 'search') ||
      nameAttr === 'q' ||
      nameAttr === 'search_query' ||
      idAttr.includes('search') ||
      placeholderAttr.includes('search');

    if (isSearchField) {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
      el.dispatchEvent(
        new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
      el.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );

      const form = el.closest('form');
      if (form) {
        try {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.submit();
          }
        } catch {}
      } else {
        const searchBtn =
          (document.querySelector('button#search-icon-legacy, button[aria-label="Search" i], button[type="submit"]') as HTMLElement);
        if (searchBtn) {
          setTimeout(() => searchBtn.click(), 100);
        }
      }
    }
  } else if (el instanceof HTMLElement && el.hasAttribute('contenteditable')) {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function executeScroll(direction: 'up' | 'down' | 'left' | 'right', amount: number) {
  switch (direction) {
    case 'up':
      window.scrollBy({ top: -amount, behavior: 'smooth' });
      break;
    case 'down':
      window.scrollBy({ top: amount, behavior: 'smooth' });
      break;
    case 'left':
      window.scrollBy({ left: -amount, behavior: 'smooth' });
      break;
    case 'right':
      window.scrollBy({ left: amount, behavior: 'smooth' });
      break;
  }
}

function executeNavigate(url: string) {
  window.location.href = url;
}

function executeBack() {
  window.history.back();
}

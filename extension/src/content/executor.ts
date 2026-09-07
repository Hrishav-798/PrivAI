/**
 * PrivAI — Browser Action Executor
 *
 * Executes structured browser actions with pre-flight checks, post-action DOM stability waiting,
 * error recovery with scroll-into-view retry, and support for all structured action types.
 */

import { Action } from '../types';
import { registry } from './elementRegistry';
import { waitForDOMStable, waitForElement } from './mutationObserver';

export async function executeAction(action: Action): Promise<void> {
  switch (action.action) {
    case 'click':
      if (!action.target) throw new Error('Click requires a target');
      await executeClick(action.target);
      break;
    case 'type':
      if (!action.target) throw new Error('Type requires a target');
      if (action.text === undefined) throw new Error('Type requires text');
      await executeType(action.target, action.text);
      break;
    case 'scroll':
      executeScroll(action.direction || 'down', action.amount || 500);
      break;
    case 'scroll_to_element':
      if (!action.target) throw new Error('scroll_to_element requires a target');
      await executeScrollToElement(action.target);
      break;
    case 'scroll_to_top':
      executeScrollToBoundary('top');
      break;
    case 'scroll_to_bottom':
      executeScrollToBoundary('bottom');
      break;
    case 'navigate':
      if (!action.url) throw new Error('Navigate requires a url');
      executeNavigate(action.url);
      break;
    case 'go_back':
      executeBack();
      break;
    case 'select':
      if (!action.target) throw new Error('Select requires a target');
      if (!action.value) throw new Error('Select requires a value');
      await executeSelect(action.target, action.value);
      break;
    case 'check':
      if (!action.target) throw new Error('Check requires a target');
      await executeCheck(action.target, true);
      break;
    case 'uncheck':
      if (!action.target) throw new Error('Uncheck requires a target');
      await executeCheck(action.target, false);
      break;
    case 'press_key':
      if (!action.key) throw new Error('press_key requires a key');
      executePressKey(action.key, action.target);
      break;
    case 'extract':
      // Handled by agent loop (reads DOM data)
      break;
    case 'wait_for_element':
      if (!action.target) throw new Error('wait_for_element requires a target selector');
      await waitForElement(action.target, 5000);
      break;
    case 'wait':
    case 'read_page':
    case 'finish':
    case 'ask_user':
      // Handled by agent loop
      break;
    default:
      throw new Error(`Unsupported action: ${(action as any).action}`);
  }

  // Post-action: wait for DOM to stabilize
  await waitForDOMStable(250, 2000);
}

// ---- Element Resolution ----

/**
 * Resilient element finder with multi-tier fallback:
 * 1. Highlight index ([3])
 * 2. Agent registry (WeakRef -> attribute -> XPath -> CSS)
 * 3. Exact data-agent-id
 * 4. DOM id
 * 5. Name attribute
 * 6. CSS selector
 * 7. Aria-label / placeholder / title
 * 8. Substring match
 * 9. Interactive text match
 */
function findTargetElement(id: string): Element | null {
  if (!id) return null;

  // 1. Try highlight index (e.g., "3" or "[3]")
  const indexMatch = id.match(/^\[?(\d+)\]?$/);
  if (indexMatch) {
    const el = registry.findElementByIndex(parseInt(indexMatch[1]));
    if (el) return el;
  }

  // 2. Try agent registry (handles WeakRef, data-agent-id, and XPath/CSS recovery)
  const registryEl = registry.findElementById(id) || registry.findElementByDescription(id);
  if (registryEl) return registryEl;

  // 3. Check data-agent-id
  let el = document.querySelector(`[data-agent-id="${id}"]`);
  if (el) return el;

  // 4. Check standard DOM id
  el = document.getElementById(id);
  if (el) return el;

  // 5. Check name attribute
  el = document.querySelector(`[name="${id}"]`);
  if (el) return el;

  // 6. Try as CSS selector
  try {
    el = document.querySelector(id);
    if (el) return el;
  } catch { /* invalid selector syntax */ }

  // 7. Match aria-label, placeholder, or title
  try {
    el = document.querySelector(`[aria-label="${id}" i], [placeholder="${id}" i], [title="${id}" i]`);
    if (el) return el;
  } catch { /* ignore */ }

  // 8. Substring match on data-agent-id or id
  try {
    el = document.querySelector(`[data-agent-id*="${id}"], [id*="${id}"]`);
    if (el) return el;
  } catch { /* ignore */ }

  // 9. Match interactive elements by text content
  const interactives = document.querySelectorAll(
    'button, a, input[type="button"], input[type="submit"], [role="button"], label, select, [tabindex]'
  );
  const lowerTarget = id.toLowerCase();
  for (const btn of interactives) {
    const text = btn.textContent?.trim().toLowerCase() || '';
    if (text && (text === lowerTarget || text.includes(lowerTarget))) {
      return btn;
    }
  }

  // 10. Coordinate target fallback ("coord:x,y" or "x,y")
  const coordMatch = id.match(/^(?:coord:)?(\d+(?:\.\d+)?)[,x](\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const x = parseFloat(coordMatch[1]);
    const y = parseFloat(coordMatch[2]);
    if (typeof document.elementFromPoint === 'function') {
      const el = document.elementFromPoint(x, y);
      if (el) return el;
    }
  }

  return null;
}

/**
 * Find element with scroll-into-view retry if element exists but is offscreen.
 */
async function findTargetWithRetry(id: string): Promise<Element> {
  // First try
  let el = findTargetElement(id);
  if (el) return el;

  // If coordinate target, do not scroll-retry (coordinates are viewport-relative)
  if (/^(?:coord:)?\d+(?:\.\d+)?[,x]\d+(?:\.\d+)?$/.test(id)) {
    throw new Error(`Coordinate target "${id}" points to no interactable element in viewport`);
  }

  // Scroll down a bit and try again (element may be lazy-loaded or below viewport)
  if (typeof window.scrollBy === 'function') {
    window.scrollBy({ top: 400, behavior: 'smooth' });
    await new Promise((r) => setTimeout(r, 400));
    el = findTargetElement(id);
    if (el) return el;

    // Scroll up and try
    window.scrollBy({ top: -800, behavior: 'smooth' });
    await new Promise((r) => setTimeout(r, 400));
    el = findTargetElement(id);
    if (el) return el;

    // Return to original position
    window.scrollBy({ top: 400, behavior: 'smooth' });
  }

  throw new Error(`Target element "${id}" not found on page after scroll retry`);
}

// ---- Action Implementations ----

async function executeClick(id: string): Promise<void> {
  const el = await findTargetWithRetry(id);
  const coordMatch = id.match(/^(?:coord:)?(\d+(?:\.\d+)?)[,x](\d+(?:\.\d+)?)$/);

  // Scroll into view safely if not a coordinate click
  if (!coordMatch && el instanceof HTMLElement && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, 200));
  }

  // Check if element is enabled
  if (el instanceof HTMLButtonElement && el.disabled) {
    throw new Error(`Target element "${id}" is disabled`);
  }

  if (coordMatch) {
    const x = parseFloat(coordMatch[1]);
    const y = parseFloat(coordMatch[2]);
    if (el instanceof HTMLElement && typeof el.focus === 'function') el.focus();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    return;
  }

  if (el instanceof HTMLElement) {
    if (typeof el.focus === 'function') el.focus();
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
}

async function executeType(id: string, text: string): Promise<void> {
  const el = await findTargetWithRetry(id);

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

  // Scroll into view safely
  if (el instanceof HTMLElement) {
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise((r) => setTimeout(r, 150));
    }
    if (typeof el.focus === 'function') el.focus();
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // Clear existing content first using native setter where available
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
    if (isSearchField(el)) {
      await new Promise((r) => setTimeout(r, 100));
      submitSearch(el);
    }
  } else if (el instanceof HTMLElement && el.hasAttribute('contenteditable')) {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function isSearchField(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const nameAttr = (el.getAttribute('name') || '').toLowerCase();
  const idAttr = (el.id || '').toLowerCase();
  const placeholderAttr = (el.getAttribute('placeholder') || '').toLowerCase();
  const typeAttr = el instanceof HTMLInputElement ? el.type : '';
  return (
    typeAttr === 'search' ||
    nameAttr === 'q' ||
    nameAttr === 'search_query' ||
    nameAttr === 'search' ||
    idAttr.includes('search') ||
    placeholderAttr.includes('search')
  );
}

function submitSearch(el: HTMLInputElement | HTMLTextAreaElement): void {
  // Dispatch Enter key events
  const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
  el.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
  el.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

  // Try form submission
  const form = el.closest('form');
  if (form) {
    try {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    } catch { /* ignore submission errors */ }
  } else {
    // Try clicking a search button
    const searchBtn = document.querySelector(
      'button#search-icon-legacy, button[aria-label="Search" i], button[type="submit"], input[type="submit"]'
    ) as HTMLElement;
    if (searchBtn) {
      setTimeout(() => searchBtn.click(), 100);
    }
  }
}

/**
 * Find scrollable container for SPA/overflow layouts where window scroll doesn't move.
 */
function findScrollContainer(): Element | null {
  const candidates = document.querySelectorAll('main, [role="main"], article, #content, .content, #app, #root');
  for (const c of candidates) {
    if (c.scrollHeight > c.clientHeight && c.clientHeight > 200) {
      try {
        const style = window.getComputedStyle(c);
        if (style && ['auto', 'scroll'].includes(style.overflowY)) {
          return c;
        }
      } catch { /* ignore style access errors in test env */ }
    }
  }
  return null;
}

function executeScroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): void {
  const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
  const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0;

  const prevScrollY = typeof window.scrollY === 'number' ? window.scrollY : 0;

  if (typeof window.scrollBy === 'function') {
    window.scrollBy({ top: deltaY, left: deltaX, behavior: 'smooth' });
  }

  // Fallback for nested/container scrollable layouts
  setTimeout(() => {
    if (typeof window !== 'undefined' && typeof window.scrollY === 'number' && window.scrollY === prevScrollY && deltaY !== 0) {
      const container = findScrollContainer() || document.scrollingElement || document.documentElement || document.body;
      if (container && typeof container.scrollBy === 'function') {
        container.scrollBy({ top: deltaY, left: deltaX, behavior: 'smooth' });
      }
    }
  }, 50);
}

function executeScrollToBoundary(boundary: 'top' | 'bottom'): void {
  const isTop = boundary === 'top';
  const targetY = isTop ? 0 : Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0);

  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }

  const container = findScrollContainer() || document.scrollingElement || document.documentElement || document.body;
  if (container && typeof container.scrollTo === 'function') {
    container.scrollTo({ top: isTop ? 0 : container.scrollHeight, behavior: 'smooth' });
  }
}

async function executeScrollToElement(id: string): Promise<void> {
  const el = await findTargetWithRetry(id);
  if (el instanceof HTMLElement && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function executeSelect(id: string, value: string): Promise<void> {
  const el = await findTargetWithRetry(id);

  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Target element "${id}" is not a select element`);
  }

  // Try to find option by value first, then by text
  let found = false;
  for (const option of el.options) {
    if (option.value === value || option.text.toLowerCase().includes(value.toLowerCase())) {
      el.value = option.value;
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error(`Option "${value}" not found in select element "${id}"`);
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function executeCheck(id: string, checked: boolean): Promise<void> {
  const el = await findTargetWithRetry(id);

  if (!(el instanceof HTMLInputElement) ||
    (el.type !== 'checkbox' && el.type !== 'radio')) {
    throw new Error(`Target element "${id}" is not a checkbox or radio button`);
  }

  if (el.checked !== checked) {
    el.checked = checked;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function executePressKey(key: string, target?: string): void {
  const el = target ? findTargetElement(target) : document.activeElement || document.body;
  if (!el) throw new Error('No element to send key event to');

  const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
    enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
    escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
    space: { key: ' ', code: 'Space', keyCode: 32 },
    backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
    arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  };

  const keyInfo = keyMap[key.toLowerCase()] || { key, code: key, keyCode: 0 };
  const opts = { ...keyInfo, which: keyInfo.keyCode, bubbles: true, cancelable: true };

  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

function executeNavigate(url: string): void {
  window.location.href = url;
}

function executeBack(): void {
  window.history.back();
}

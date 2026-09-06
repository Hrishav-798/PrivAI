/**
 * PrivAI — DOM Scanner
 *
 * Page observation pipeline for semantic DOM parsing.
 * Scans meaningful elements, assigns stable element IDs, generates
 * resilient XPaths, and produces a compact semantic representation
 * for client-side privacy inspection and local reasoning.
 */

import { DOMElement, PageState, PerceptionData } from '../types/common';
import { registry } from './elementRegistry';

// ---- Configuration ----

/** Maximum text length per element to keep context compact */
const MAX_TEXT_LENGTH = 200;

/** All elements worth scanning for semantic understanding */
const SCAN_SELECTOR = [
  // Interactive elements
  'button', 'a', 'input', 'textarea', 'select', 'option',
  'details', 'summary', 'dialog',
  // Semantic structure
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'label', 'legend', 'caption', 'figcaption',
  'blockquote', 'pre', 'code',
  // Lists
  'li', 'dt', 'dd',
  // Tables
  'table', 'th', 'td',
  // Media
  'img', 'video', 'audio',
  // Navigation / Layout landmarks
  'nav', 'main', 'article', 'section', 'aside', 'header', 'footer', 'form',
  // ARIA roles
  '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="searchbox"]',
  '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="tabpanel"]',
  '[role="menu"]', '[role="menuitem"]', '[role="dialog"]', '[role="alert"]',
  '[role="navigation"]', '[role="search"]', '[role="combobox"]',
  '[role="listbox"]', '[role="option"]', '[role="slider"]', '[role="switch"]',
  '[role="progressbar"]', '[role="tree"]', '[role="treeitem"]',
  // Contenteditable
  '[contenteditable="true"]',
  // Clickable divs/spans (limited — only with event or tabindex)
  '[tabindex]', '[onclick]',
].join(', ');

/** Tags that are always interactive */
const INTERACTIVE_TAGS = new Set([
  'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY', 'DETAILS',
]);

/** Tags that represent semantic content (we want their text but they're not interactive) */
const CONTENT_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH',
  'BLOCKQUOTE', 'PRE', 'CODE', 'LABEL', 'LEGEND', 'CAPTION',
  'FIGCAPTION', 'DT', 'DD', 'SPAN',
]);

/** Tags that are structural landmarks */
const LANDMARK_TAGS = new Set([
  'NAV', 'MAIN', 'ARTICLE', 'SECTION', 'ASIDE', 'HEADER', 'FOOTER', 'FORM',
]);

// ---- Visibility Checks ----

function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

// ---- Text Extraction ----

/**
 * Extract direct text content of an element without duplicating nested child elements.
 */
function getDirectText(el: Element): string {
  if (el instanceof HTMLInputElement) {
    return el.value || el.placeholder || el.name || '';
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value || el.placeholder || '';
  }
  if (el instanceof HTMLSelectElement) {
    const selected = el.options[el.selectedIndex];
    return selected?.text || '';
  }
  if (el instanceof HTMLImageElement) {
    return el.alt || el.title || '';
  }

  // For most elements, get direct text nodes only (no child element text)
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    }
  }
  text = text.trim().replace(/\s+/g, ' ');

  // If no direct text, fall back to textContent for leaf elements
  if (!text && el.children.length === 0) {
    text = el.textContent?.trim().replace(/\s+/g, ' ') || '';
  }

  return capText(text);
}

/**
 * Get full text content including children — used for headings, labels, buttons.
 */
function getFullText(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return getDirectText(el);
  }
  return capText(el.textContent?.trim().replace(/\s+/g, ' ') || '');
}

function capText(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH - 3) + '...';
  }
  return text;
}

// ---- Element Metadata ----

function getElementLabel(el: Element): string | null {
  // aria-label is highest priority
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // For inputs, find associated label
  if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim() || null;
  }

  // title attribute
  const title = el.getAttribute('title');
  if (title) return title;

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent?.trim() || null;
  }

  return null;
}

function getInputType(el: Element): string | null {
  if (el instanceof HTMLInputElement) return el.type;
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  return null;
}

function isInteractive(el: Element): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute('role');
  if (role && ['button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio',
    'tab', 'menuitem', 'combobox', 'option', 'switch', 'slider'].includes(role)) {
    return true;
  }
  if (el.hasAttribute('tabindex')) return true;
  if (el.hasAttribute('onclick')) return true;
  if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') return true;
  return false;
}

function getSemanticRole(el: Element): string {
  const tag = el.tagName;
  const role = el.getAttribute('role');

  if (role) return role;

  // Map tags to semantic roles
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'P') return 'paragraph';
  if (tag === 'A') return 'link';
  if (tag === 'BUTTON') return 'button';
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'search') return 'searchbox';
    if (type === 'submit' || type === 'button') return 'button';
    return 'textbox';
  }
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'SELECT') return 'listbox';
  if (tag === 'IMG') return 'image';
  if (tag === 'NAV') return 'navigation';
  if (tag === 'MAIN') return 'main';
  if (tag === 'FORM') return 'form';
  if (tag === 'TABLE') return 'table';
  if (tag === 'TH' || tag === 'TD') return 'cell';
  if (tag === 'LI') return 'listitem';
  if (tag === 'LABEL') return 'label';
  if (tag === 'DIALOG') return 'dialog';
  if (tag === 'SECTION') return 'region';
  if (tag === 'ARTICLE') return 'article';
  if (tag === 'ASIDE') return 'complementary';
  if (tag === 'HEADER') return 'banner';
  if (tag === 'FOOTER') return 'contentinfo';
  if (tag === 'SUMMARY') return 'button';
  if (tag === 'DETAILS') return 'group';
  if (tag === 'BLOCKQUOTE') return 'blockquote';
  if (tag === 'PRE' || tag === 'CODE') return 'code';

  return 'generic';
}

function getPrefix(el: Element): string {
  const tag = el.tagName;
  if (tag === 'BUTTON' || el.getAttribute('role') === 'button') return 'agent-btn';
  if (tag === 'A') return 'agent-link';
  if (tag === 'INPUT') return 'agent-input';
  if (tag === 'TEXTAREA') return 'agent-textarea';
  if (tag === 'SELECT') return 'agent-select';
  if (/^H[1-6]$/.test(tag)) return 'agent-heading';
  if (tag === 'IMG') return 'agent-img';
  if (tag === 'TABLE') return 'agent-table';
  if (tag === 'FORM') return 'agent-form';
  if (tag === 'NAV') return 'agent-nav';
  if (tag === 'LI') return 'agent-item';
  if (tag === 'P') return 'agent-text';
  if (tag === 'LABEL') return 'agent-label';
  if (tag === 'TD' || tag === 'TH') return 'agent-cell';
  return 'agent-el';
}

// ---- XPath Generation ----

export function getXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let index = 1;
    let sibling: Element | null = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    const tagName = current.tagName.toLowerCase();
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return '//' + parts.join('/');
}

// ---- Simple CSS Selector ----

export function getCSSSelector(el: Element): string {
  // If element has a unique ID, use it
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
    return `#${CSS.escape(el.id)}`;
  }

  // Use data-agent-id if assigned
  const agentId = el.getAttribute('data-agent-id');
  if (agentId) {
    return `[data-agent-id="${agentId}"]`;
  }

  // Build a path using tag + nth-child
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && current !== document.body && depth < 5) {
    const tag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        parts.unshift(`${tag}:nth-of-type(${idx})`);
      } else {
        parts.unshift(tag);
      }
    } else {
      parts.unshift(tag);
    }
    current = parent;
    depth++;
  }

  return parts.join(' > ');
}

// ---- Semantic Tree Builder ----

export function buildSemanticTree(elements: DOMElement[], pageState: PageState): string {
  const lines: string[] = [];
  lines.push(`PAGE: ${pageState.url}`);
  lines.push(`TITLE: ${pageState.title}`);
  lines.push(`VIEWPORT: ${pageState.scrollY}-${pageState.scrollY + pageState.viewportHeight} of ${pageState.totalHeight}px`);
  lines.push('');
  lines.push('ELEMENTS:');

  for (const el of elements) {
    if (el.highlightIndex === undefined) continue;

    const idx = el.highlightIndex;
    const tag = el.tag;
    const attrs: string[] = [];

    if (el.input_type && el.input_type !== el.tag) attrs.push(`type="${el.input_type}"`);
    if (el.href) attrs.push(`href="${capText(el.href)}"`);
    if (el.placeholder) attrs.push(`placeholder="${el.placeholder}"`);
    if (el.checked !== undefined) attrs.push(`checked="${el.checked}"`);
    if (el.selectedValue) attrs.push(`value="${el.selectedValue}"`);
    if (el.alt) attrs.push(`alt="${el.alt}"`);

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    const text = el.text ? ` "${capText(el.text)}"` : '';
    const label = el.label && el.label !== el.text ? ` label="${el.label}"` : '';
    const viewport = el.inViewport ? '' : ' [offscreen]';

    lines.push(`[${idx}] <${tag}${attrStr}>${text}${label}${viewport}`);
  }

  return lines.join('\n');
}

// ---- Main Scanner ----

function collectAllElements(root: Document | ShadowRoot): Element[] {
  const elements: Element[] = [];
  try {
    const list = root.querySelectorAll(SCAN_SELECTOR);
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el.id === 'privai-assistant-root' || el.id === 'privai-overlay-container') continue;
      elements.push(el);
      if (el.shadowRoot) {
        elements.push(...collectAllElements(el.shadowRoot));
      }
    }
  } catch {}
  return elements;
}

/**
 * Scans the entire DOM and produces a comprehensive, structured observation
 * of the page for the agent. Every element gets a numbered highlight index
 * so the LLM can reference elements as "[1]", "[2]", etc.
 */
export function scanDOM(): PerceptionData {
  const allElements = collectAllElements(document);
  const elements: DOMElement[] = [];
  const counts = {
    interactive: 0,
    buttons: 0,
    inputs: 0,
    links: 0,
    headings: 0,
    images: 0,
    tables: 0,
    forms: 0,
    total: 0,
  };

  registry.reset();
  let highlightIdx = 0;

  // Deduplicate: track elements we've already processed
  const processed = new WeakSet<Element>();

  for (const el of allElements) {
    // Skip our own UI elements
    if (el.closest('#privai-assistant-root') || el.closest('#privai-overlay-container')) continue;

    // Skip already-processed elements
    if (processed.has(el)) continue;
    processed.add(el);

    // Skip invisible elements
    if (!isElementVisible(el)) continue;

    const interactive = isInteractive(el);
    const semanticRole = getSemanticRole(el);

    // For structural landmarks without meaningful direct text, skip creating elements
    // but still count them
    if (LANDMARK_TAGS.has(el.tagName) && !interactive) {
      if (el.tagName === 'FORM') counts.forms++;
      if (el.tagName === 'NAV') continue; // nav structure captured via child links
      // Section/article/aside/header/footer captured via children
      continue;
    }

    // Associated labels (label for="...") provide metadata for their input elements,
    // so skip scanning them as separate standalone elements.
    if (el.tagName === 'LABEL' && el.getAttribute('for')) continue;

    // For content elements, require some text
    const isContent = CONTENT_TAGS.has(el.tagName);
    const text = interactive || el.tagName.match(/^H[1-6]$/) || el.tagName === 'IMG'
      ? getFullText(el)
      : getDirectText(el);

    if (isContent && !text && !interactive) continue;
    // Skip spans with no text
    if (el.tagName === 'SPAN' && !text && !interactive) continue;

    const prefix = getPrefix(el);
    const id = registry.getIdForElement(el, prefix);
    const rect = el.getBoundingClientRect();
    const elInViewport = isInViewport(el);

    const bbox: DOMElement['bbox'] = {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    const inputType = getInputType(el);
    const placeholder = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      ? el.placeholder : undefined;
    const autocomplete = el.getAttribute('autocomplete') || undefined;
    const href = el instanceof HTMLAnchorElement ? el.href : undefined;
    const alt = el instanceof HTMLImageElement ? el.alt : undefined;
    const checked = (el instanceof HTMLInputElement &&
      (el.type === 'checkbox' || el.type === 'radio'))
      ? el.checked : undefined;
    const selectedValue = el instanceof HTMLSelectElement
      ? el.value : undefined;

    const currentHighlightIdx = highlightIdx++;
    const xpath = getXPath(el);
    const cssSelector = getCSSSelector(el);

    registry.registerHighlightIndex(currentHighlightIdx, id);
    registry.registerSelectors(id, xpath, cssSelector);

    const domEl: DOMElement = {
      id,
      element_id: id,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      text,
      label: getElementLabel(el),
      type: inputType,
      input_type: inputType,
      bbox,
      visible: true,
      enabled: !(el as HTMLInputElement).disabled,
      interactive,
      placeholder,
      autocomplete,
      xpath,
      cssSelector,
      inViewport: elInViewport,
      semanticRole,
      highlightIndex: currentHighlightIdx,
      href,
      alt,
      checked,
      selectedValue,
      childCount: el.children.length,
    };

    elements.push(domEl);

    // Count categories
    counts.total++;
    if (interactive) counts.interactive++;
    if (domEl.tag === 'button' || domEl.role === 'button' || domEl.input_type === 'submit') counts.buttons++;
    if (domEl.tag === 'input' || domEl.tag === 'textarea') counts.inputs++;
    if (domEl.tag === 'a') counts.links++;
    if (domEl.tag.match(/^h[1-6]$/)) counts.headings++;
    if (domEl.tag === 'img') counts.images++;
    if (domEl.tag === 'table') counts.tables++;
    if (domEl.tag === 'form') counts.forms++;
  }

  // Build page state
  const pageState: PageState = {
    url: window.location.href,
    title: document.title || '',
    scrollY: Math.round(window.scrollY),
    scrollX: Math.round(window.scrollX),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    totalHeight: Math.round(document.documentElement.scrollHeight),
    totalWidth: Math.round(document.documentElement.scrollWidth),
    readyState: document.readyState,
    isStable: document.readyState === 'complete',
  };

  // Build semantic tree representation for LLM
  const semanticTree = buildSemanticTree(elements, pageState);

  return {
    elements,
    pageTitle: document.title || '',
    pageUrl: window.location.href || '',
    pageState,
    semanticTree,
    counts,
  };
}

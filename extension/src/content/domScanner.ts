import { DOMElement, PerceptionData } from '../types/common';
import { registry } from './elementRegistry';

function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getElementText(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.placeholder || el.value || el.name || '';
  }
  return el.textContent?.trim().replace(/\s+/g, ' ') || '';
}

function getElementLabel(el: Element): string | null {
  if (el instanceof HTMLInputElement && el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim() || null;
  }
  return el.getAttribute('aria-label') || el.getAttribute('title') || null;
}

function getElementType(el: Element): string | null {
  if (el instanceof HTMLInputElement) return el.type;
  return null;
}

const INTERACTIVE_TAGS = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY', 'DETAILS'];

function isInteractive(el: Element): boolean {
  return INTERACTIVE_TAGS.includes(el.tagName) || el.getAttribute('role') === 'button' || el.hasAttribute('tabindex');
}

function getPrefix(el: Element): string {
  if (el.tagName === 'BUTTON') return 'agent-btn';
  if (el.tagName === 'A') return 'agent-link';
  if (el.tagName === 'INPUT') return 'agent-input';
  return 'agent-el';
}

export function scanDOM(): PerceptionData {
  const elementsToScan = document.querySelectorAll('button, a, input, textarea, select, h1, h2, h3, h4, h5, h6, [role="button"]');
  const elements: DOMElement[] = [];
  const counts = { interactive: 0, buttons: 0, inputs: 0, links: 0 };

  registry.reset(); 

  elementsToScan.forEach(el => {
    if (!isElementVisible(el)) return;

    const interactive = isInteractive(el);
    const id = registry.getIdForElement(el, getPrefix(el));
    const rect = el.getBoundingClientRect();
    
    const bbox = {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };

    const domEl: DOMElement = {
      id,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      text: getElementText(el),
      label: getElementLabel(el),
      type: getElementType(el),
      bbox,
      visible: true,
      enabled: !(el as HTMLInputElement).disabled,
      interactive
    };

    elements.push(domEl);

    if (interactive) counts.interactive++;
    if (domEl.tag === 'button' || domEl.role === 'button') counts.buttons++;
    if (domEl.tag === 'input') counts.inputs++;
    if (domEl.tag === 'a') counts.links++;
  });

  return { elements, counts };
}

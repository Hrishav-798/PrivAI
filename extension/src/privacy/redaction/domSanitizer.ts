import { RawDOM, SanitizedDOM, SensitiveRegion, DOMElement } from '../../types';
import { PageState } from '../../types/common';
import { sanitizeUrl } from '../sanitization/urlSanitizer';

function capText(str: string, maxLen: number = 80): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

function buildSemanticTree(elements: DOMElement[], pageState: PageState): string {
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

    const rawAny = el as any;
    if (el.input_type && el.input_type !== el.tag) attrs.push(`type="${el.input_type}"`);
    if (el.href) attrs.push(`href="${capText(el.href)}"`);
    if (el.placeholder) attrs.push(`placeholder="${el.placeholder}"`);
    if (el.checked !== undefined) attrs.push(`checked="${el.checked}"`);
    const val = el.selectedValue || rawAny.value;
    if (val) attrs.push(`value="${val}"`);
    if (el.alt) attrs.push(`alt="${el.alt}"`);
    if (rawAny.title) attrs.push(`title="${rawAny.title}"`);
    if (rawAny['aria-label'] || rawAny.ariaLabel) attrs.push(`aria-label="${rawAny['aria-label'] || rawAny.ariaLabel}"`);

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    const text = el.text ? ` "${capText(el.text)}"` : '';
    const label = el.label && el.label !== el.text ? ` label="${el.label}"` : '';
    const viewport = el.inViewport ? '' : ' [offscreen]';

    lines.push(`[${idx}] <${tag}${attrStr}>${text}${label}${viewport}`);
  }

  return lines.join('\n');
}

/**
 * Sanitizes a RawDOM by removing or replacing sensitive text/values with [REDACTED].
 * Creates a brand-new SanitizedDOM object without mutating the original RawDOM.
 */
export function sanitizeDOM(rawDOM: RawDOM, sensitiveRegions: SensitiveRegion[]): SanitizedDOM {
  // Map of sensitive element IDs for fast lookup
  const sensitiveMap = new Map<string, SensitiveRegion>();
  const knownPrefixes = ['api_key_', 'apikey_', 'pwd_', 'email_', 'phone_', 'id_', 'cc_', 'secret_', 'face_'];

  for (const region of sensitiveRegions) {
    if (!region.id) continue;

    let targetElementId = '';
    for (const prefix of knownPrefixes) {
      if (region.id.startsWith(prefix)) {
        targetElementId = region.id.slice(prefix.length);
        break;
      }
    }

    if (!targetElementId && region.id.includes('_')) {
      targetElementId = region.id.slice(region.id.indexOf('_') + 1);
    }

    if (targetElementId) {
      sensitiveMap.set(targetElementId, region);
    }
  }

  const sanitizedElements: DOMElement[] = rawDOM.elements.map((el) => {
    const elId = el.element_id || el.id || '';
    const rawAny = el as any;
    const sanitizedEl: DOMElement & Record<string, any> = {
      ...el,
      id: elId,
      element_id: elId,
      bbox: { ...el.bbox },
    };

    const isPassword =
      el.input_type === 'password' ||
      el.type === 'password' ||
      rawAny.autocomplete?.toLowerCase().includes('password') ||
      rawAny.name?.toLowerCase().includes('password') ||
      rawAny.name?.toLowerCase().includes('passwd') ||
      rawAny.name?.toLowerCase().includes('pwd') ||
      elId.toLowerCase().includes('password') ||
      elId.toLowerCase().includes('passwd') ||
      elId.toLowerCase().includes('pwd') ||
      elId.toLowerCase().includes('pin');

    const region = sensitiveMap.get(elId);

    if (isPassword) {
      sanitizedEl.text = '[REDACTED]';
      sanitizedEl.value = '[REDACTED]';
      sanitizedEl.selectedValue = '[REDACTED]';
      if (sanitizedEl.placeholder) sanitizedEl.placeholder = '[REDACTED]';
      if (sanitizedEl.label) sanitizedEl.label = '[REDACTED]';
      if (sanitizedEl.alt) sanitizedEl.alt = '[REDACTED]';
      if (sanitizedEl.title) sanitizedEl.title = '[REDACTED]';
      if (sanitizedEl['aria-label']) sanitizedEl['aria-label'] = '[REDACTED]';
      if (sanitizedEl.ariaLabel) sanitizedEl.ariaLabel = '[REDACTED]';
      if (sanitizedEl['aria-describedby']) sanitizedEl['aria-describedby'] = '[REDACTED]';
      if (sanitizedEl.ariaDescribedBy) sanitizedEl.ariaDescribedBy = '[REDACTED]';
      if (sanitizedEl.dataset && typeof sanitizedEl.dataset === 'object') {
        const cleanData: Record<string, string> = {};
        for (const k of Object.keys(sanitizedEl.dataset)) cleanData[k] = '[REDACTED]';
        sanitizedEl.dataset = cleanData;
      }
    } else if (region) {
      if (sanitizedEl.text) sanitizedEl.text = '[REDACTED]';
      if (sanitizedEl.value) sanitizedEl.value = '[REDACTED]';
      if (sanitizedEl.selectedValue) sanitizedEl.selectedValue = '[REDACTED]';
      if (sanitizedEl.placeholder) sanitizedEl.placeholder = '[REDACTED]';
      if (sanitizedEl.label) sanitizedEl.label = '[REDACTED]';
      if (sanitizedEl.alt) sanitizedEl.alt = '[REDACTED]';
      if (sanitizedEl.title) sanitizedEl.title = '[REDACTED]';
      if (sanitizedEl['aria-label']) sanitizedEl['aria-label'] = '[REDACTED]';
      if (sanitizedEl.ariaLabel) sanitizedEl.ariaLabel = '[REDACTED]';
      if (sanitizedEl['aria-describedby']) sanitizedEl['aria-describedby'] = '[REDACTED]';
      if (sanitizedEl.ariaDescribedBy) sanitizedEl.ariaDescribedBy = '[REDACTED]';
      if (sanitizedEl.dataset && typeof sanitizedEl.dataset === 'object') {
        const cleanData: Record<string, string> = {};
        for (const k of Object.keys(sanitizedEl.dataset)) cleanData[k] = '[REDACTED]';
        sanitizedEl.dataset = cleanData;
      }
    } else {
      // Global regex sanitization for unflagged elements (defense-in-depth)
      if (typeof sanitizedEl.text === 'string') sanitizedEl.text = sanitizeText(sanitizedEl.text);
      if (typeof sanitizedEl.value === 'string') sanitizedEl.value = sanitizeText(sanitizedEl.value);
      if (typeof sanitizedEl.selectedValue === 'string') sanitizedEl.selectedValue = sanitizeText(sanitizedEl.selectedValue);
      if (typeof sanitizedEl.placeholder === 'string') sanitizedEl.placeholder = sanitizeText(sanitizedEl.placeholder);
      if (typeof sanitizedEl.label === 'string') sanitizedEl.label = sanitizeText(sanitizedEl.label);
      if (typeof sanitizedEl.alt === 'string') sanitizedEl.alt = sanitizeText(sanitizedEl.alt);
      if (typeof sanitizedEl.title === 'string') sanitizedEl.title = sanitizeText(sanitizedEl.title);
      if (typeof sanitizedEl['aria-label'] === 'string') sanitizedEl['aria-label'] = sanitizeText(sanitizedEl['aria-label']);
      if (typeof sanitizedEl.ariaLabel === 'string') sanitizedEl.ariaLabel = sanitizeText(sanitizedEl.ariaLabel);
      if (typeof sanitizedEl['aria-describedby'] === 'string') sanitizedEl['aria-describedby'] = sanitizeText(sanitizedEl['aria-describedby']);
      if (typeof sanitizedEl.ariaDescribedBy === 'string') sanitizedEl.ariaDescribedBy = sanitizeText(sanitizedEl.ariaDescribedBy);
      if (sanitizedEl.dataset && typeof sanitizedEl.dataset === 'object') {
        const cleanData: Record<string, string> = {};
        for (const [k, v] of Object.entries(sanitizedEl.dataset)) {
          cleanData[k] = typeof v === 'string' ? sanitizeText(v) : String(v);
        }
        sanitizedEl.dataset = cleanData;
      }
    }

    // Sanitize link attributes if present
    if (sanitizedEl.href) {
      sanitizedEl.href = sanitizeUrl(sanitizedEl.href);
    }
    if (sanitizedEl.src) {
      sanitizedEl.src = sanitizeUrl(sanitizedEl.src);
    }

    return sanitizedEl;
  });

  const sanitizedPageState = rawDOM.pageState
    ? {
        ...rawDOM.pageState,
        url: sanitizeUrl(rawDOM.pageState.url),
      }
    : undefined;

  // Re-generate semantic tree strictly from sanitized elements so it never leaks
  let sanitizedSemanticTree: string | undefined = undefined;
  if (sanitizedPageState) {
    sanitizedSemanticTree = buildSemanticTree(sanitizedElements, sanitizedPageState);
  }

  return {
    __brand: 'SanitizedDOM',
    elements: sanitizedElements,
    url: sanitizeUrl(rawDOM.url),
    title: rawDOM.title,
    timestamp: rawDOM.timestamp,
    pageState: sanitizedPageState,
    semanticTree: sanitizedSemanticTree,
  };
}

/**
 * Defense-in-depth text scrubber applying all PII and secret patterns.
 */
function sanitizeText(text: string): string {
  return text
    // Emails (plus-addressing & subdomains)
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, '[REDACTED]')
    // Phone numbers (international, dot, extension, US, Indian)
    .replace(/(?:\+(?:[1-9]\d{0,2})[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}(?:\s*(?:ext|x|ext.)\s*\d+)?)|(?:\b\d{3}[\.\-]\d{3}[\.\-]\d{4}\b)|(?:\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?:\s*(?:ext|x|ext.)\s*\d+)?\b)|(?:\b(?:\+?91[\-\s]?)?[6789]\d{9}\b)/g, '[REDACTED]')
    // Aadhaar / SSN / Indian PAN
    .replace(/\b\d{4}[\s\-\.]\d{4}[\s\-\.]\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[REDACTED]')
    // Formatted credit cards
    .replace(/\b(?:\d{4}[\s-]){3}\d{4}\b/g, '[REDACTED]')
    // API keys
    .replace(/\b(?:sk-[a-zA-Z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b/g, '[REDACTED]')
    // Private keys
    .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED]');
}

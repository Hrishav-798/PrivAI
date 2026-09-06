import { RawDOM, SanitizedDOM, SensitiveRegion, DOMElement } from '../../types';
import { buildSemanticTree } from '../../content/domScanner';

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
    const sanitizedEl: DOMElement = {
      ...el,
      id: elId,
      element_id: elId,
      bbox: { ...el.bbox },
    };

    const isPassword =
      el.input_type === 'password' ||
      el.type === 'password' ||
      el.autocomplete?.includes('password') ||
      elId.toLowerCase().includes('password');

    const region = sensitiveMap.get(elId);

    if (isPassword) {
      sanitizedEl.text = '[REDACTED]';
      if (sanitizedEl.placeholder) sanitizedEl.placeholder = '[REDACTED]';
    } else if (region) {
      if (sanitizedEl.text && sanitizedEl.text.trim() !== '') {
        sanitizedEl.text = '[REDACTED]';
      }
      if (sanitizedEl.placeholder) {
        sanitizedEl.placeholder = '[REDACTED]';
      }
    } else {
      // Global regex sanitization for unflagged elements (defense-in-depth)
      if (sanitizedEl.text) {
        sanitizedEl.text = sanitizeText(sanitizedEl.text);
      }
      if (sanitizedEl.placeholder) {
        sanitizedEl.placeholder = sanitizeText(sanitizedEl.placeholder);
      }
    }

    return sanitizedEl;
  });

  // Re-generate semantic tree strictly from sanitized elements so it never leaks
  let sanitizedSemanticTree: string | undefined = undefined;
  if (rawDOM.pageState) {
    sanitizedSemanticTree = buildSemanticTree(sanitizedElements, rawDOM.pageState);
  }

  return {
    __brand: 'SanitizedDOM',
    elements: sanitizedElements,
    url: rawDOM.url,
    title: rawDOM.title,
    timestamp: rawDOM.timestamp,
    pageState: rawDOM.pageState,
    semanticTree: sanitizedSemanticTree,
  };
}

/**
 * Defense-in-depth text scrubber applying all PII and secret patterns.
 */
function sanitizeText(text: string): string {
  return text
    // Emails
    .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[REDACTED]')
    // Phone numbers
    .replace(/(\+?91[\-\s]?)?[6789]\d{9}|\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]')
    // Aadhaar / SSN
    .replace(/\b\d{4}\s\d{4}\s\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]')
    // Formatted credit cards
    .replace(/\b(?:\d{4}[\s-]){3}\d{4}\b/g, '[REDACTED]')
    // API keys
    .replace(/\b(?:sk-[a-zA-Z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b/g, '[REDACTED]')
    // Private keys
    .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED]');
}

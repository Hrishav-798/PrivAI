import { RawDOM, SanitizedDOM, SensitiveRegion, DOMElement } from '../../types';

/**
 * Sanitizes a RawDOM by removing or replacing sensitive text/values with [REDACTED].
 * Creates a brand-new SanitizedDOM object without mutating the original RawDOM.
 */
export function sanitizeDOM(rawDOM: RawDOM, sensitiveRegions: SensitiveRegion[]): SanitizedDOM {
  // Map of sensitive element IDs for fast lookup
  const sensitiveMap = new Map<string, SensitiveRegion>();
  for (const region of sensitiveRegions) {
    if (region.id.includes('_')) {
      const elementId = region.id.split('_').slice(1).join('_');
      sensitiveMap.set(elementId, region);
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
    } else if (region) {
      if (sanitizedEl.text && sanitizedEl.text.trim() !== '') {
        sanitizedEl.text = '[REDACTED]';
      }
    } else if (sanitizedEl.text) {
      // Global regex sanitization for emails, phones, Aadhaar, SSN
      sanitizedEl.text = sanitizedEl.text
        .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[REDACTED]')
        .replace(/(\+?91[\-\s]?)?[6789]\d{9}|\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]')
        .replace(/\b\d{4}\s\d{4}\s\d{4}\b|\b\d{12}\b/g, '[REDACTED]');
    }

    return sanitizedEl;
  });

  return {
    __brand: 'SanitizedDOM',
    elements: sanitizedElements,
    url: rawDOM.url,
    title: rawDOM.title,
    timestamp: rawDOM.timestamp,
  };
}

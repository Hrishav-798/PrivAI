import { RawDOM, SanitizedDOM, SensitiveRegion, DOMElement } from '../../types';

/**
 * Sanitizes a RawDOM by removing or replacing sensitive text/values with [REDACTED].
 * It creates a new object and does not mutate the original RawDOM.
 */
export function sanitizeDOM(rawDOM: RawDOM, sensitiveRegions: SensitiveRegion[]): SanitizedDOM {
  // Map of sensitive element IDs for quick lookup
  const sensitiveMap = new Map<string, SensitiveRegion>();
  for (const region of sensitiveRegions) {
    if (region.id.includes('_')) {
      // id format is type_elementId, e.g. pwd_el-1
      const elementId = region.id.split('_').slice(1).join('_');
      sensitiveMap.set(elementId, region);
    }
  }

  const sanitizedElements: DOMElement[] = rawDOM.elements.map(el => {
    // Deep clone the element to prevent mutation
    const sanitizedEl: DOMElement = { ...el, bbox: { ...el.bbox } };

    const region = sensitiveMap.get(el.element_id);
    
    // If the element is specifically flagged, completely redact it
    if (region) {
      if (sanitizedEl.text && sanitizedEl.text.trim() !== '') {
        sanitizedEl.text = '[REDACTED]';
      }
      // Also redact input values if they were recorded anywhere, though text usually holds it
    } else {
      // Even if not fully flagged, check if the text contains parts that match global regex redactions
      // In a full implementation, we'd replace the specific regex matches with [REDACTED]
      // For now, if a region was generated from 'regex' for this element, we redact the whole text or try to replace.
      
      // Let's implement partial replacement if we had text offsets. 
      // Since regions are tied to bounding boxes, if we just want to sanitize DOM string, we can do global replace.
      if (sanitizedEl.text) {
        // Simple global sanitization for emails and phones in unflagged elements just to be safe
        sanitizedEl.text = sanitizedEl.text.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[REDACTED]');
        sanitizedEl.text = sanitizedEl.text.replace(/(\+?91[\-\s]?)?[6789]\d{9}|\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]');
      }
    }

    return sanitizedEl;
  });

  return {
    __brand: 'SanitizedDOM',
    elements: sanitizedElements,
    url: rawDOM.url,
    title: rawDOM.title,
    timestamp: rawDOM.timestamp
  };
}

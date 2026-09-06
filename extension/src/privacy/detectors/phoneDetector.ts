import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class PhoneDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    // International phone regex supporting Indian (+91), North American (+1), European (+44, +49, etc.),
    // dot notation (123.456.7890), extensions (ext. 101), and E.164 compact formats.
    const phoneRegex = /(?:\+(?:[1-9]\d{0,2})[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}(?:\s*(?:ext|x|ext.)\s*\d+)?)|(?:\b\d{3}[\.\-]\d{3}[\.\-]\d{4}\b)|(?:\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?:\s*(?:ext|x|ext.)\s*\d+)?\b)|(?:\b(?:\+?91[\-\s]?)?[6789]\d{9}\b)/g;

    for (const el of dom.elements) {
      const elId = el.element_id || el.id;
      const isPhoneInput = 
        el.input_type === 'tel' ||
        el.type === 'tel' ||
        el.autocomplete === 'tel' ||
        el.element_id?.toLowerCase().includes('phone') ||
        el.id?.toLowerCase().includes('phone') ||
        el.label?.toLowerCase().includes('phone') ||
        el.placeholder?.toLowerCase().includes('phone');

      if (isPhoneInput) {
        regions.push({
          id: `phone_${elId}`,
          type: 'phone',
          bbox: el.bbox,
          confidence: 1.0,
          source: 'dom',
          redaction: 'mask'
        });
        continue;
      }

      // Check text, placeholder, label, and alt content
      const textSources = [el.text, el.placeholder, el.label, el.alt].filter(
        (val): val is string => typeof val === 'string' && val.trim().length > 0
      );

      for (const str of textSources) {
        const matches = str.match(phoneRegex);
        if (matches && matches.length > 0) {
          regions.push({
            id: `phone_${elId}`,
            type: 'phone',
            bbox: el.bbox,
            confidence: 0.85,
            source: 'regex',
            redaction: 'mask'
          });
          break;
        }
      }
    }
    
    return regions;
  }
}

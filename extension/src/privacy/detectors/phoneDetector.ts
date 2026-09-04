import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class PhoneDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    // Generic & Indian phone regex
    // Matches patterns like +91 9876543210, 98765-43210, (123) 456-7890
    const phoneRegex = /(\+?91[\-\s]?)?[6789]\d{9}|(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/g;

    for (const el of dom.elements) {
      const isPhoneInput = 
        el.input_type === 'tel' ||
        el.autocomplete === 'tel' ||
        el.element_id?.toLowerCase().includes('phone') ||
        el.label?.toLowerCase().includes('phone');

      if (isPhoneInput) {
        regions.push({
          id: `phone_${el.element_id}`,
          type: 'phone',
          bbox: el.bbox,
          confidence: 1.0,
          source: 'dom',
          redaction: 'mask'
        });
        continue;
      }

      // Check text content
      if (el.text && typeof el.text === 'string') {
        const matches = el.text.match(phoneRegex);
        if (matches && matches.length > 0) {
          regions.push({
            id: `phone_${el.element_id}`,
            type: 'phone',
            bbox: el.bbox,
            confidence: 0.85,
            source: 'regex',
            redaction: 'mask'
          });
        }
      }
    }
    
    return regions;
  }
}

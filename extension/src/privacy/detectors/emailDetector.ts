import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class EmailDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    // Comprehensive email regex supporting plus-addressing, subdomains, and hyphenated domains
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

    for (const el of dom.elements) {
      const elId = el.element_id || el.id;
      const isEmailInput = 
        el.input_type === 'email' ||
        el.type === 'email' ||
        el.autocomplete === 'email' ||
        el.element_id?.toLowerCase().includes('email') ||
        el.id?.toLowerCase().includes('email') ||
        el.label?.toLowerCase().includes('email') ||
        el.placeholder?.toLowerCase().includes('email');

      if (isEmailInput) {
        regions.push({
          id: `email_${elId}`,
          type: 'email',
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

      let found = false;
      for (const str of textSources) {
        const matches = str.match(emailRegex);
        if (matches && matches.length > 0) {
          regions.push({
            id: `email_${elId}`,
            type: 'email',
            bbox: el.bbox,
            confidence: 0.9,
            source: 'regex',
            redaction: 'mask'
          });
          found = true;
          break;
        }
      }
    }
    
    return regions;
  }
}

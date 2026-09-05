import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class EmailDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    // Basic email regex
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;

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

      // Check text content
      if (el.text && typeof el.text === 'string') {
        const matches = el.text.match(emailRegex);
        if (matches && matches.length > 0) {
          regions.push({
            id: `email_${elId}`,
            type: 'email',
            bbox: el.bbox,
            confidence: 0.9,
            source: 'regex',
            redaction: 'mask'
          });
        }
      }
    }
    
    return regions;
  }
}

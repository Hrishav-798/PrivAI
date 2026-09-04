import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class SemanticDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    
    const sensitiveKeywords = ['address', 'credit card', 'debit card', 'cvv', 'dob', 'date of birth'];

    for (const el of dom.elements) {
      const lowerLabel = el.label?.toLowerCase() || '';
      const lowerId = el.element_id?.toLowerCase() || '';

      let isSensitive = false;
      for (const keyword of sensitiveKeywords) {
        if (lowerLabel.includes(keyword) || lowerId.includes(keyword)) {
          isSensitive = true;
          break;
        }
      }

      // Names are sometimes sensitive but can be very broad. Let's flag explicit name fields if needed, 
      // but only if they are inputs to avoid overly masking normal text.
      if (el.input_type === 'text' && (lowerLabel.includes('name') || lowerId.includes('name'))) {
        isSensitive = true;
      }

      if (isSensitive) {
        regions.push({
          id: `sem_${el.element_id}`,
          type: 'sensitive', // Using 'sensitive' or 'name'/'address'
          bbox: el.bbox,
          confidence: 0.7,
          source: 'dom',
          redaction: 'mask' // Can also be blackout
        });
      }
    }
    
    return regions;
  }
}

import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class SemanticDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    
    const sensitiveKeywords = ['address', 'credit card', 'debit card', 'cvv', 'dob', 'date of birth'];

    for (const el of dom.elements) {
      const elId = el.element_id || el.id || '';
      const lowerLabel = (el.label || '').toLowerCase();
      const lowerId = elId.toLowerCase();
      const lowerPlaceholder = (el.placeholder || '').toLowerCase();

      let isSensitive = false;
      for (const keyword of sensitiveKeywords) {
        if (lowerLabel.includes(keyword) || lowerId.includes(keyword) || lowerPlaceholder.includes(keyword)) {
          isSensitive = true;
          break;
        }
      }

      // Names are sensitive in inputs:
      const elType = el.input_type || el.type || '';
      if (elType === 'text' && (lowerLabel.includes('name') || lowerId.includes('name') || lowerPlaceholder.includes('name'))) {
        isSensitive = true;
      }

      if (isSensitive) {
        regions.push({
          id: `sem_${elId}`,
          type: 'sensitive',
          bbox: el.bbox,
          confidence: 0.7,
          source: 'dom',
          redaction: 'mask'
        });
      }
    }
    
    return regions;
  }
}

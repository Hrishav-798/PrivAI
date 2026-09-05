import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class IdDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    // Aadhaar regex: 4 digits, space, 4 digits, space, 4 digits or just 12 digits
    const aadhaarRegex = /\b\d{4}\s\d{4}\s\d{4}\b|\b\d{12}\b/g;
    
    // SSN regex (basic)
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;

    for (const el of dom.elements) {
      const elId = el.element_id || el.id;
      const isIdLabel = 
        el.label?.toLowerCase().includes('aadhaar') ||
        el.label?.toLowerCase().includes('ssn') ||
        el.label?.toLowerCase().includes('identity') ||
        el.element_id?.toLowerCase().includes('aadhaar') ||
        el.id?.toLowerCase().includes('aadhaar');

      if (isIdLabel) {
        regions.push({
          id: `id_${elId}`,
          type: 'id',
          bbox: el.bbox,
          confidence: 0.9,
          source: 'dom',
          redaction: 'mask'
        });
        continue;
      }

      // Check text content
      if (el.text && typeof el.text === 'string') {
        const hasAadhaar = el.text.match(aadhaarRegex);
        const hasSsn = el.text.match(ssnRegex);
        if (hasAadhaar || hasSsn) {
          regions.push({
            id: `id_${elId}`,
            type: 'id',
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

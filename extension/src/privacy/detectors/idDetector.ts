import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class IdDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    // Aadhaar regex: 4 digits separated by space, dash, dot, or contiguous 12 digits
    const aadhaarRegex = /\b\d{4}[\s\-\.]\d{4}[\s\-\.]\d{4}\b|\b\d{12}\b/g;
    
    // Indian PAN card regex: 5 uppercase letters, 4 digits, 1 uppercase letter
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

    // SSN regex (US)
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;

    for (const el of dom.elements) {
      const elId = el.element_id || el.id;
      const isIdLabel = 
        el.label?.toLowerCase().includes('aadhaar') ||
        el.label?.toLowerCase().includes('ssn') ||
        el.label?.toLowerCase().includes('identity') ||
        el.label?.toLowerCase().includes('pan') ||
        el.element_id?.toLowerCase().includes('aadhaar') ||
        el.element_id?.toLowerCase().includes('pan') ||
        el.id?.toLowerCase().includes('aadhaar') ||
        el.id?.toLowerCase().includes('pan');

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

      // Check text, placeholder, label, and alt content
      const textSources = [el.text, el.placeholder, el.label, el.alt].filter(
        (val): val is string => typeof val === 'string' && val.trim().length > 0
      );

      for (const str of textSources) {
        const hasAadhaar = str.match(aadhaarRegex);
        const hasPan = str.match(panRegex);
        const hasSsn = str.match(ssnRegex);
        if (hasAadhaar || hasPan || hasSsn) {
          regions.push({
            id: `id_${elId}`,
            type: 'id',
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

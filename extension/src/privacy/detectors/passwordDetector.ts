import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class PasswordDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    
    for (const el of dom.elements) {
      const idLow = (el.element_id || el.id || '').toLowerCase();
      const labelLow = (el.label || '').toLowerCase();
      const placeholderLow = (el.placeholder || '').toLowerCase();
      const autocompleteLow = (el.autocomplete || '').toLowerCase();

      const isPassword = 
        el.input_type === 'password' ||
        el.type === 'password' ||
        autocompleteLow.includes('password') ||
        idLow.includes('password') ||
        idLow.includes('pwd') ||
        idLow.includes('passcode') ||
        idLow.includes('pin') ||
        labelLow.includes('password') ||
        labelLow.includes('passcode') ||
        labelLow.includes('pin') ||
        placeholderLow.includes('password') ||
        placeholderLow.includes('passcode') ||
        placeholderLow.includes('pin');

      if (isPassword) {
        const elId = el.element_id || el.id;
        regions.push({
          id: `pwd_${elId}`,
          type: 'password',
          bbox: el.bbox,
          confidence: 1.0,
          source: 'dom',
          redaction: 'blackout'
        });
      }
    }
    
    return regions;
  }
}

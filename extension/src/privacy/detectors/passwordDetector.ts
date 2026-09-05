import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class PasswordDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    
    for (const el of dom.elements) {
      const isPassword = 
        el.input_type === 'password' ||
        el.type === 'password' ||
        el.autocomplete?.includes('password') ||
        el.element_id?.toLowerCase().includes('password') ||
        el.id?.toLowerCase().includes('password') ||
        el.label?.toLowerCase().includes('password') ||
        el.placeholder?.toLowerCase().includes('password');

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

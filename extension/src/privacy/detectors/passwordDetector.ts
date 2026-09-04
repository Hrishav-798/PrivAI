import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class PasswordDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    
    for (const el of dom.elements) {
      const isPassword = 
        el.input_type === 'password' ||
        el.autocomplete?.includes('password') ||
        el.element_id?.toLowerCase().includes('password') ||
        el.label?.toLowerCase().includes('password');

      if (isPassword) {
        regions.push({
          id: `pwd_${el.element_id}`,
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

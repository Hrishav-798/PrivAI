import { describe, it, expect } from 'vitest';
import { PasswordDetector } from '../privacy/detectors/passwordDetector';
import { EmailDetector } from '../privacy/detectors/emailDetector';
import { PhoneDetector } from '../privacy/detectors/phoneDetector';
import { IdDetector } from '../privacy/detectors/idDetector';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { assertSafeToTransmit, PrivacyViolationError } from '../privacy/validation/privacyValidator';
import { RawContext, RawDOM, SanitizedContext } from '../types';

describe('Privacy Detectors', () => {
  it('detects password fields', () => {
    const detector = new PasswordDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: '1', tag: 'input', role: 'textbox', text: '', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, input_type: 'password', enabled: true, focused: false },
        { element_id: '2', tag: 'input', role: 'textbox', text: '', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, input_type: 'text', enabled: true, focused: false }
      ]
    };
    
    const regions = detector.detect(dom);
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('password');
    expect(regions[0].id).toBe('pwd_1');
  });

  it('detects emails via text regex and input type', () => {
    const detector = new EmailDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: '1', tag: 'input', role: 'textbox', text: '', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, input_type: 'email', enabled: true, focused: false },
        { element_id: '2', tag: 'span', role: 'text', text: 'Contact: demo@example.com', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true, focused: false }
      ]
    };
    
    const regions = detector.detect(dom);
    expect(regions).toHaveLength(2);
    expect(regions.every(r => r.type === 'email')).toBe(true);
  });

  it('detects phones via text regex and input type', () => {
    const detector = new PhoneDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: '1', tag: 'input', role: 'textbox', text: '', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, input_type: 'tel', enabled: true, focused: false },
        { element_id: '2', tag: 'span', role: 'text', text: 'Call +91 9876543210 for help', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true, focused: false }
      ]
    };
    
    const regions = detector.detect(dom);
    expect(regions).toHaveLength(2);
    expect(regions.every(r => r.type === 'phone')).toBe(true);
  });
  
  it('detects aadhaar/ssn identifiers', () => {
    const detector = new IdDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: '1', tag: 'span', role: 'text', text: 'ID: 1234 5678 9012', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true, focused: false }
      ]
    };
    
    const regions = detector.detect(dom);
    expect(regions).toHaveLength(1);
    expect(regions[0].type).toBe('id');
  });
});

describe('Privacy Firewall', () => {
  it('blocks RawContext', () => {
    const rawContext = { __brand: 'RawContext' } as any;
    expect(() => assertSafeToTransmit(rawContext)).toThrow(PrivacyViolationError);
  });

  it('blocks SanitizedContext with leaking PII text', () => {
    const leakingContext: SanitizedContext = {
      __brand: 'SanitizedContext',
      screenshot: {} as any,
      dom: {
        __brand: 'SanitizedDOM',
        url: 'http://test', title: 'test', timestamp: 0,
        elements: [
          { element_id: '1', tag: 'span', role: 'text', text: 'Leak: demo@example.com', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true, focused: false }
        ]
      },
      redactions: [],
      privacy: {} as any
    };
    
    expect(() => assertSafeToTransmit(leakingContext)).toThrow(PrivacyViolationError);
  });

  it('allows clean SanitizedContext', () => {
    const cleanContext: SanitizedContext = {
      __brand: 'SanitizedContext',
      screenshot: {} as any,
      dom: {
        __brand: 'SanitizedDOM',
        url: 'http://test', title: 'test', timestamp: 0,
        elements: [
          { element_id: '1', tag: 'span', role: 'text', text: 'Leak: [REDACTED]', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true, focused: false }
        ]
      },
      redactions: [],
      privacy: {} as any
    };
    
    expect(() => assertSafeToTransmit(cleanContext)).not.toThrow();
  });
});

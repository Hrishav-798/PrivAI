import { describe, it, expect } from 'vitest';
import { PasswordDetector } from '../privacy/detectors/passwordDetector';
import { EmailDetector } from '../privacy/detectors/emailDetector';
import { PhoneDetector } from '../privacy/detectors/phoneDetector';
import { IdDetector } from '../privacy/detectors/idDetector';
import { ApiKeyDetector } from '../privacy/detectors/apiKeyDetector';
import { CreditCardDetector, passesLuhn } from '../privacy/detectors/creditCardDetector';
import { SecretDetector } from '../privacy/detectors/secretDetector';
import { sanitizeDOM } from '../privacy/redaction/domSanitizer';
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

  it('detects API keys (OpenAI, AWS, GitHub, attributes)', () => {
    const detector = new ApiKeyDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: 'key_1', tag: 'span', role: 'text', text: 'sk-proj-abc123456789012345678901234567890', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
        { element_id: 'key_2', tag: 'span', role: 'text', text: 'AWS_ACCESS_KEY: AKIAIOSFODNN7EXAMPLE', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
        { element_id: 'key_3', tag: 'input', role: 'textbox', text: '', label: 'Enter API Key', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, enabled: true, placeholder: 'api_key' },
      ]
    };

    const regions = detector.detect(dom);
    expect(regions).toHaveLength(3);
    expect(regions.every(r => r.type === 'api_key')).toBe(true);
  });

  it('detects credit card numbers with Luhn validation and rejects invalid/all-zeros', () => {
    expect(passesLuhn('4532015112830366')).toBe(true);
    expect(passesLuhn('0000000000000000')).toBe(false);
    expect(passesLuhn('1234567890123456')).toBe(false);

    const detector = new CreditCardDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: 'cc_1', tag: 'span', role: 'text', text: 'Card: 4532015112830366', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
        { element_id: 'cc_2', tag: 'input', role: 'textbox', text: '', label: 'Card Number', autocomplete: 'cc-number', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, enabled: true },
        { element_id: 'cc_3', tag: 'span', role: 'text', text: 'Random number: 1234567890123456', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
      ]
    };

    const regions = detector.detect(dom);
    expect(regions).toHaveLength(2); // Valid Luhn card + cc-number field. Invalid card rejected!
    expect(regions.every(r => r.type === 'credit_card')).toBe(true);
  });

  it('detects private keys and session secrets', () => {
    const detector = new SecretDetector();
    const dom: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: 'sec_1', tag: 'pre', role: 'code', text: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
        { element_id: 'sec_2', tag: 'span', role: 'text', text: 'session_id = "abc1234567890123456789"', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
      ]
    };

    const regions = detector.detect(dom);
    expect(regions).toHaveLength(2);
    expect(regions.every(r => r.type === 'secret')).toBe(true);
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

  it('blocks SanitizedContext with leaking API keys', () => {
    const leakingContext: SanitizedContext = {
      __brand: 'SanitizedContext',
      screenshot: {} as any,
      dom: {
        __brand: 'SanitizedDOM',
        url: 'http://test', title: 'test', timestamp: 0,
        elements: [
          { element_id: '1', tag: 'span', role: 'text', text: 'Key: sk-proj-1234567890123456789012', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true }
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

  it('sanitizes DOM elements and scrubs sensitive values into [REDACTED]', () => {
    const rawDOM: RawDOM = {
      __brand: 'RawDOM',
      url: 'http://test', title: 'test', timestamp: 0,
      elements: [
        { element_id: 'user_email', tag: 'input', role: 'textbox', text: 'alice@company.org', label: 'Email', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, enabled: true },
        { element_id: 'user_phone', tag: 'input', role: 'textbox', text: '+91 9876543210', label: 'Phone', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: true, enabled: true },
        { element_id: 'user_api_key', tag: 'span', role: 'text', text: 'sk-proj-01234567890123456789', label: '', bbox: {x:0,y:0,width:10,height:10}, visible: true, interactive: false, enabled: true },
      ]
    };

    const regions = [
      { id: 'email_user_email', type: 'email' as const, bbox: {x:0,y:0,width:10,height:10}, confidence: 1, source: 'dom' as const, redaction: 'blackout' as const },
      { id: 'phone_user_phone', type: 'phone' as const, bbox: {x:0,y:0,width:10,height:10}, confidence: 1, source: 'dom' as const, redaction: 'blackout' as const },
      { id: 'apikey_user_api_key', type: 'api_key' as const, bbox: {x:0,y:0,width:10,height:10}, confidence: 1, source: 'dom' as const, redaction: 'blackout' as const },
    ];

    const sanitized = sanitizeDOM(rawDOM, regions);
    expect(sanitized.elements[0].text).toBe('[REDACTED]');
    expect(sanitized.elements[1].text).toBe('[REDACTED]');
    expect(sanitized.elements[2].text).toBe('[REDACTED]');
  });
});

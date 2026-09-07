import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransmissionGate, PrivacyViolationError } from '../network/TransmissionGate';
import { RemoteContextClient } from '../network/RemoteContextClient';
import { SanitizedContext, RawContext } from '../types';

describe('Zero-Egress Network Boundary & Hard Transmission Gate Tests', () => {
  let outboundRequests: Array<{ url: string; method: string; body: string; sizeBytes: number }>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    outboundRequests = [];
    globalThis.fetch = vi.fn().mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      const sizeBytes = body ? new TextEncoder().encode(body).length : 0;
      outboundRequests.push({ url, method, body, sizeBytes });

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ action: { action: 'read_page' }, reasoning: 'ok', confidence: 0.95 }),
        json: async () => ({ action: { action: 'read_page' }, reasoning: 'ok', confidence: 0.95 }),
      };
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createValidSanitizedContext(): SanitizedContext {
    return {
      __brand: 'SanitizedContext',
      screenshot: new Blob(['fake-sanitized-image'], { type: 'image/png' }) as any,
      dom: {
        __brand: 'SanitizedDOM',
        url: 'https://demo.privai.local/checkout',
        title: 'Checkout Page',
        timestamp: Date.now(),
        elements: [
          {
            id: 'item_title',
            element_id: 'item_title',
            tag: 'h1',
            role: 'heading',
            text: 'Cart Items',
            label: null,
            bbox: { x: 10, y: 10, width: 200, height: 40 },
            visible: true,
            interactive: false,
            enabled: true,
          },
          {
            id: 'email_field',
            element_id: 'email_field',
            tag: 'input',
            role: 'textbox',
            text: '[REDACTED]',
            label: 'Email Address',
            placeholder: '[REDACTED]',
            bbox: { x: 10, y: 60, width: 200, height: 30 },
            visible: true,
            interactive: true,
            enabled: true,
          },
        ],
      },
      redactions: [
        {
          id: 'redact_1',
          type: 'email',
          bbox: { x: 10, y: 60, width: 200, height: 30 },
          treatment: 'blackout',
          provenance: {
            detector: 'EmailDetector',
            sourceType: 'dom',
            timestamp: Date.now(),
            rawType: 'email',
          },
        },
      ],
      privacy: {
        raw_data_removed: true,
        sanitized: true,
        regions_detected: 1,
        regions_redacted: 1,
        scan_ms: 5.2,
        version: '1.0.0',
        timestamp: Date.now(),
        dom_sanitized: true,
        screenshot_sanitized: true,
        url_sanitized: true,
        policy_version: 'privai-v1-zero-egress',
      },
    };
  }

  // ---- 1. PASSWORD LEAK ATTEMPT ----
  it('[Case 1: Password] blocks transmission when unredacted password is in input value or text', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[1].input_type = 'password';
    context.dom.elements[1].type = 'password';
    (context.dom.elements[1] as any).value = 'SuperSecretPassword123!';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Login')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 2. EMAIL LEAK ATTEMPT ----
  it('[Case 2: Email] blocks transmission when unredacted email is present in element text', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[0].text = 'leaked_user@company.com';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Process checkout')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 3. PHONE LEAK ATTEMPT ----
  it('[Case 3: Phone] blocks transmission when unredacted phone number is present', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[0].text = 'Contact: +91 9876543210';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Call support')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 4. CREDIT CARD LEAK ATTEMPT ----
  it('[Case 4: Credit Card] blocks transmission when unredacted credit card with valid Luhn is present', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[0].text = 'Card: 4111 1111 1111 1111';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Process checkout')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 5. AADHAAR LEAK ATTEMPT ----
  it('[Case 5: Aadhaar] blocks transmission when unredacted Aadhaar number is present', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[0].text = 'Aadhaar: 4321 8765 2109';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Verify identity')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 6. PAN LEAK ATTEMPT ----
  it('[Case 6: PAN] blocks transmission when unredacted Indian PAN is present', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[0].text = 'PAN: ABCDE1234F';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Verify tax info')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 7. API KEY LEAK ATTEMPT ----
  it('[Case 7: API Key] blocks transmission when unredacted API key is present', async () => {
    const context = createValidSanitizedContext();
    context.dom.elements[0].text = 'API_KEY: sk-abcdef1234567890abcdef1234567890';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Configure API')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 8. PRIVATE KEY LEAK ATTEMPT ----
  it('[Case 8: Private Key] blocks transmission when unredacted private key is present in nested metadata', async () => {
    const context = createValidSanitizedContext();
    (context.dom as any).pageState = {
      url: 'https://example.com',
      nestedDebug: {
        rawCert: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
      },
    };

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Test nested private key')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 9. TOKEN URL LEAK ATTEMPT ----
  it('[Case 9: Token URL] blocks transmission when sensitive credentials appear in URL parameters', async () => {
    const context = createValidSanitizedContext();
    context.dom.url = 'https://demo.privai.local/dashboard?page_token=secret_abc123&session_id=sess_9988';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Navigate dashboard')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 10. RAW SCREENSHOT LEAK ATTEMPT ----
  it('[Case 10: Raw Screenshot] blocks transmission when screenshot is marked as RawScreenshot', async () => {
    const context = createValidSanitizedContext();
    (context.screenshot as any).__brand = 'RawScreenshot';

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Test raw screenshot brand')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 11. RAW DOM LEAK ATTEMPT ----
  it('[Case 11: Raw DOM] blocks transmission when RawContext/RawDOM is passed', async () => {
    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob(['raw-pixel-data'], { type: 'image/png' }) as any,
      dom: {
        __brand: 'RawDOM',
        url: 'https://example.com/account',
        title: 'User Profile',
        timestamp: Date.now(),
        elements: [
          {
            id: 'pwd_field',
            element_id: 'pwd_field',
            tag: 'input',
            type: 'password',
            role: 'textbox',
            text: 'SecretPassword123!',
            label: 'Password',
            bbox: { x: 10, y: 10, width: 100, height: 20 },
            visible: true,
            interactive: true,
            enabled: true,
          },
        ],
      },
    };

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(rawContext as any, 'Log in to account')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
    const totalBytesSent = outboundRequests.reduce((acc, r) => acc + r.sizeBytes, 0);
    expect(totalBytesSent).toBe(0);
  });

  // ---- 12. MISSING PROVENANCE LEAK ATTEMPT ----
  it('[Case 12: Missing Provenance / Privacy Metadata] blocks transmission when privacy metadata is missing', async () => {
    const context = createValidSanitizedContext();
    delete (context as any).privacy;

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Test missing privacy metadata')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 13. FAILED REDACTION LEAK ATTEMPT ----
  it('[Case 13: Failed Redaction] blocks transmission when redaction treatment or bounding box is corrupted', async () => {
    const context = createValidSanitizedContext();
    context.redactions[0].bbox = { x: 0, y: 0, width: 0, height: -5 };

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Read page')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 14. FAILED PERCEPTION LEAK ATTEMPT ----
  it('[Case 14: Failed Perception] blocks transmission when pipeline stage indicates incomplete sanitization', async () => {
    const context = createValidSanitizedContext();
    context.privacy.dom_sanitized = false;

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(context, 'Read page')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- 15. MUTATED SANITIZED CONTEXT / ANTI-TAMPERING ----
  it('[Case 15: Mutated Context / Anti-Tampering] blocks transmission when object prototype manipulation or hidden properties are injected', async () => {
    const maliciousContext = Object.create({ maliciousProp: true });
    Object.assign(maliciousContext, createValidSanitizedContext());

    const client = new RemoteContextClient('http://localhost:8000');
    await expect(client.plan(maliciousContext, 'Test proto')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);

    const hiddenFieldContext = createValidSanitizedContext();
    (hiddenFieldContext as any).hiddenRawPassword = 'SecretPassword99!';
    await expect(client.plan(hiddenFieldContext, 'Test hidden property')).rejects.toThrow(PrivacyViolationError);
    expect(outboundRequests.length).toBe(0);
  });

  // ---- LEGITIMATE TRANSMISSION ----
  it('allows verified sanitized context and transmits strictly sanitized payload across network', async () => {
    const context = createValidSanitizedContext();
    const client = new RemoteContextClient('http://localhost:8000');

    const response = await client.plan(context, 'Review items in cart');

    expect(response.action.action).toBe('read_page');
    expect(outboundRequests.length).toBe(1);
    expect(outboundRequests[0].url).toBe('http://localhost:8000/api/agent/plan');

    const sentPayload = JSON.parse(outboundRequests[0].body);
    expect(sentPayload.task).toBe('Review items in cart');
    expect(sentPayload.page_url).toBe('https://demo.privai.local/checkout');
    expect(sentPayload.sanitized_dom[1].text).toBe('[REDACTED]');
    expect(sentPayload.sanitized_screenshot).toBeDefined();
  });
});

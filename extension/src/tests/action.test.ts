import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateAction, classifyActionRisk, buildConfirmationRequest } from '../background/actionValidator';
import { executeAction } from '../content/executor';
import { Action, DOMElement } from '../types';

describe('Action Validation & Safety Gate', () => {
  const mockElements: DOMElement[] = [
    {
      element_id: 'agent-btn-0',
      tag: 'button',
      role: 'button',
      text: 'Submit Order',
      label: 'Submit Order',
      bbox: { x: 10, y: 10, width: 80, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
      highlightIndex: 1,
    },
    {
      element_id: 'agent-btn-1',
      tag: 'button',
      role: 'button',
      text: 'Delete Account',
      label: 'Delete Account',
      bbox: { x: 10, y: 50, width: 80, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
      highlightIndex: 2,
    },
    {
      element_id: 'agent-input-0',
      tag: 'input',
      role: 'textbox',
      text: '',
      label: 'Username',
      input_type: 'text',
      bbox: { x: 10, y: 90, width: 150, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
      highlightIndex: 3,
    },
    {
      element_id: 'agent-input-pwd',
      tag: 'input',
      role: 'textbox',
      text: '',
      label: 'Password',
      input_type: 'password',
      bbox: { x: 10, y: 130, width: 150, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
      highlightIndex: 4,
    },
    {
      element_id: 'agent-select-0',
      tag: 'select',
      role: 'listbox',
      text: '',
      label: 'Country',
      bbox: { x: 10, y: 170, width: 150, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
      highlightIndex: 5,
    },
    {
      element_id: 'agent-check-0',
      tag: 'input',
      role: 'checkbox',
      text: '',
      label: 'Agree to terms',
      input_type: 'checkbox',
      bbox: { x: 10, y: 210, width: 20, height: 20 },
      visible: true,
      interactive: true,
      enabled: true,
      highlightIndex: 6,
    },
    {
      element_id: 'hidden-target',
      tag: 'button',
      role: 'button',
      text: 'Hidden',
      label: 'Hidden',
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      visible: false,
      interactive: true,
      enabled: true,
      highlightIndex: 7,
    },
  ];

  it('accepts valid click and type actions', () => {
    const clickAction: Action = { action: 'click', target: 'agent-btn-0' };
    expect(() => validateAction(clickAction, mockElements)).not.toThrow();

    const typeAction: Action = {
      action: 'type',
      target: 'agent-input-0',
      text: 'harmless text',
    };
    expect(() => validateAction(typeAction, mockElements)).not.toThrow();
  });

  it('resolves numbered highlight index targets [1]', () => {
    const clickAction: Action = { action: 'click', target: '1' };
    validateAction(clickAction, mockElements);
    expect(clickAction.target).toBe('agent-btn-0');
  });

  it('rejects click or type without target', () => {
    const invalidClick: any = { action: 'click' };
    expect(() => validateAction(invalidClick, mockElements)).toThrow(/requires a target/);

    const invalidType: any = { action: 'type', target: 'agent-input-0' };
    expect(() => validateAction(invalidType, mockElements)).toThrow(/requires text/);
  });

  it('rejects targeting non-existent or hidden elements', () => {
    const nonExistent: Action = { action: 'click', target: 'does-not-exist' };
    expect(() => validateAction(nonExistent, mockElements)).toThrow(/does not exist in the DOM/);

    const hidden: Action = { action: 'click', target: 'hidden-target' };
    expect(() => validateAction(hidden, mockElements)).toThrow(/is not visible/);
  });

  it('prohibits typing into password fields', () => {
    const pwdAction: Action = {
      action: 'type',
      target: 'agent-input-pwd',
      text: 'secret_123',
    };
    expect(() => validateAction(pwdAction, mockElements)).toThrow(
      /Typing into password fields is prohibited/
    );
  });

  it('rejects arbitrary javascript execution in urls and text', () => {
    const jsUrl: Action = { action: 'navigate', url: 'javascript:alert(1)' };
    expect(() => validateAction(jsUrl, mockElements)).toThrow(/JavaScript execution is blocked/);

    const scriptText: Action = {
      action: 'type',
      target: 'agent-input-0',
      text: '<script>evil()</script>',
    };
    expect(() => validateAction(scriptText, mockElements)).toThrow(
      /JavaScript execution is blocked/
    );
  });

  it('validates scroll and navigate limits', () => {
    const scrollValid: Action = { action: 'scroll', direction: 'down', amount: 400 };
    expect(() => validateAction(scrollValid, mockElements)).not.toThrow();

    const scrollInvalid: Action = { action: 'scroll', direction: 'down', amount: 9000 };
    expect(() => validateAction(scrollInvalid, mockElements)).toThrow(/between 0 and 5000/);

    const navValid: Action = { action: 'navigate', url: 'https://kubernetes.io' };
    expect(() => validateAction(navValid, mockElements)).not.toThrow();

    const navBadScheme: Action = { action: 'navigate', url: 'ftp://bad.site' };
    expect(() => validateAction(navBadScheme, mockElements)).toThrow(/http:\/\/ or https:\/\//);
  });

  it('validates new actions (select, check, uncheck, press_key)', () => {
    const selectValid: Action = { action: 'select', target: 'agent-select-0', value: 'US' };
    expect(() => validateAction(selectValid, mockElements)).not.toThrow();

    const checkValid: Action = { action: 'check', target: 'agent-check-0' };
    expect(() => validateAction(checkValid, mockElements)).not.toThrow();

    const keyValid: Action = { action: 'press_key', key: 'enter' };
    expect(() => validateAction(keyValid, mockElements)).not.toThrow();
  });

  it('rejects unknown action types', () => {
    const unknown: any = { action: 'destroy_database' };
    expect(() => validateAction(unknown, mockElements)).toThrow(/Unknown action type/);
  });
});

describe('Action Risk Classification & Confirmation', () => {
  const elements: DOMElement[] = [
    {
      element_id: 'btn-delete',
      tag: 'button',
      role: 'button',
      text: 'Delete Account',
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      visible: true,
      interactive: true,
      enabled: true,
    },
    {
      element_id: 'btn-search',
      tag: 'button',
      role: 'button',
      text: 'Search',
      bbox: { x: 0, y: 0, width: 10, height: 10 },
      visible: true,
      interactive: true,
      enabled: true,
    },
  ];

  it('classifies purchase, deletion, and sensitive URLs as high risk', () => {
    const deleteAction: Action = { action: 'click', target: 'btn-delete' };
    expect(classifyActionRisk(deleteAction, elements)).toBe('high');

    const paymentNav: Action = { action: 'navigate', url: 'https://bank.com/checkout/pay' };
    expect(classifyActionRisk(paymentNav, elements)).toBe('high');
  });

  it('classifies read, scroll, and search click as low risk', () => {
    expect(classifyActionRisk({ action: 'read_page' }, elements)).toBe('low');
    expect(classifyActionRisk({ action: 'scroll', direction: 'down' }, elements)).toBe('low');
    expect(classifyActionRisk({ action: 'click', target: 'btn-search' }, elements)).toBe('low');
  });

  it('builds confirmation request for high risk action', () => {
    const deleteAction: Action = { action: 'click', target: 'btn-delete' };
    const req = buildConfirmationRequest(deleteAction, 'high', elements);
    expect(req.riskLevel).toBe('high');
    expect(req.description).toContain('Delete Account');
    expect(req.reason).toBeDefined();
  });
});

describe('Browser Executor Actions', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-container">
        <button id="search-btn" data-agent-id="agent-btn-0">Search Docs</button>
        <input id="search-input" data-agent-id="agent-input-0" type="text" value="" />
        <select id="country-select" data-agent-id="agent-select-0">
          <option value="us">United States</option>
          <option value="de">Germany</option>
        </select>
        <input id="terms-check" data-agent-id="agent-check-0" type="checkbox" />
      </div>
    `;
  });

  it('executes click on target button', async () => {
    const btn = document.getElementById('search-btn') as HTMLButtonElement;
    const clickSpy = vi.spyOn(btn, 'click');

    await executeAction({ action: 'click', target: 'agent-btn-0' });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('executes type into editable input', async () => {
    const input = document.getElementById('search-input') as HTMLInputElement;

    await executeAction({ action: 'type', target: 'agent-input-0', text: 'Docker Swarm' });
    expect(input.value).toBe('Docker Swarm');
  });

  it('executes select on dropdown', async () => {
    const sel = document.getElementById('country-select') as HTMLSelectElement;
    await executeAction({ action: 'select', target: 'agent-select-0', value: 'de' });
    expect(sel.value).toBe('de');
  });

  it('executes check and uncheck on checkbox', async () => {
    const check = document.getElementById('terms-check') as HTMLInputElement;
    expect(check.checked).toBe(false);

    await executeAction({ action: 'check', target: 'agent-check-0' });
    expect(check.checked).toBe(true);

    await executeAction({ action: 'uncheck', target: 'agent-check-0' });
    expect(check.checked).toBe(false);
  });

  it('executes scroll safely', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await executeAction({ action: 'scroll', direction: 'down', amount: 300 });
    expect(scrollSpy).toHaveBeenCalled();
  });

  it('executes key press safely', async () => {
    const input = document.getElementById('search-input') as HTMLInputElement;
    const keySpy = vi.fn();
    input.addEventListener('keydown', keySpy);

    await executeAction({ action: 'press_key', key: 'enter', target: 'agent-input-0' });
    expect(keySpy).toHaveBeenCalled();
  });
});

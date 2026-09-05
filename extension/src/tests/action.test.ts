import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAction, ActionValidationError } from '../background/actionValidator';
import { executeAction } from '../content/executor';
import { Action, DOMElement } from '../types';

describe('Action Validation & Safety Gate', () => {
  const mockElements: DOMElement[] = [
    {
      element_id: 'btn_search',
      id: 'btn_search',
      tag: 'button',
      role: 'button',
      text: 'Search',
      label: 'Search',
      bbox: { x: 100, y: 100, width: 80, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
    },
    {
      element_id: 'input_query',
      id: 'input_query',
      tag: 'input',
      role: 'textbox',
      text: '',
      label: 'Query',
      type: 'text',
      input_type: 'text',
      bbox: { x: 100, y: 150, width: 200, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
    },
    {
      element_id: 'pwd_field',
      id: 'pwd_field',
      tag: 'input',
      role: 'textbox',
      text: '',
      label: 'Password',
      type: 'password',
      input_type: 'password',
      bbox: { x: 100, y: 200, width: 200, height: 30 },
      visible: true,
      interactive: true,
      enabled: true,
    },
    {
      element_id: 'hidden_btn',
      id: 'hidden_btn',
      tag: 'button',
      role: 'button',
      text: 'Hidden',
      label: 'Hidden',
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      visible: false,
      interactive: true,
      enabled: true,
    },
  ];

  it('accepts valid click and type actions', () => {
    const clickAction: Action = { action: 'click', target: 'btn_search' };
    expect(() => validateAction(clickAction, mockElements)).not.toThrow();

    const typeAction: Action = { action: 'type', target: 'input_query', text: 'Kubernetes HPA' };
    expect(() => validateAction(typeAction, mockElements)).not.toThrow();
  });

  it('rejects click or type without target', () => {
    const invalidClick: Action = { action: 'click' };
    expect(() => validateAction(invalidClick, mockElements)).toThrow(ActionValidationError);

    const invalidType: Action = { action: 'type', target: 'input_query' };
    expect(() => validateAction(invalidType, mockElements)).toThrow();
  });

  it('rejects targeting non-existent or hidden elements', () => {
    const nonExistent: Action = { action: 'click', target: 'ghost_element' };
    expect(() => validateAction(nonExistent, mockElements)).toThrow(ActionValidationError);

    const hiddenTarget: Action = { action: 'click', target: 'hidden_btn' };
    expect(() => validateAction(hiddenTarget, mockElements)).toThrow(ActionValidationError);
  });

  it('prohibits typing into password fields', () => {
    const typePassword: Action = { action: 'type', target: 'pwd_field', text: 'Secret123' };
    expect(() => validateAction(typePassword, mockElements)).toThrow(
      /Typing into password fields is prohibited/
    );
  });

  it('rejects arbitrary javascript execution in urls and text', () => {
    const jsUrl: Action = { action: 'navigate', url: 'javascript:alert(1)' };
    expect(() => validateAction(jsUrl, mockElements)).toThrow(/JavaScript execution is blocked/);

    const scriptText: Action = {
      action: 'type',
      target: 'input_query',
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

  it('rejects unknown action types', () => {
    const unknown: any = { action: 'destroy_database' };
    expect(() => validateAction(unknown, mockElements)).toThrow(/Unknown action type/);
  });
});

describe('Browser Executor Actions', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="test-container">
        <button id="search-btn" data-agent-id="agent-btn-0">Search Docs</button>
        <input id="search-input" data-agent-id="agent-input-0" type="text" value="" />
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

  it('executes scroll safely', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    await executeAction({ action: 'scroll', direction: 'down', amount: 300 });
    expect(scrollSpy).toHaveBeenCalled();
  });
});

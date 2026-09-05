import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantWidget } from '../content/assistantWidget';

describe('PrivAI In-Page Chat Widget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();

    // Mock chrome.runtime.sendMessage
    (global as any).chrome = {
      runtime: {
        sendMessage: vi.fn((msg, cb) => {
          if (cb) cb({ success: true });
        }),
      },
    };
  });

  it('mounts inside open Shadow DOM on document.body as singleton', () => {
    const widget1 = new AssistantWidget();
    const widget2 = new AssistantWidget(); // duplicate attempt

    const hosts = document.querySelectorAll('#privai-assistant-root');
    expect(hosts.length).toBe(1);

    const shadow = hosts[0].shadowRoot!;
    const toggleBtn = shadow.getElementById('privai-toggle-btn');
    const dialog = shadow.getElementById('privai-chat-dialog');
    expect(toggleBtn).not.toBeNull();
    expect(dialog).not.toBeNull();
    expect(dialog?.classList.contains('open')).toBe(false);
  });

  it('opens and closes the chat dialog on button click', () => {
    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;
    const toggleBtn = shadow.getElementById('privai-toggle-btn');
    const closeBtn = shadow.getElementById('privai-btn-close');
    const dialog = shadow.getElementById('privai-chat-dialog');

    // Click to open
    toggleBtn?.click();
    expect(dialog?.classList.contains('open')).toBe(true);

    // Click close
    closeBtn?.click();
    expect(dialog?.classList.contains('open')).toBe(false);
  });

  it('allows user typing and sends message on Enter without Shift', () => {
    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;
    const textarea = shadow.getElementById('privai-input') as HTMLTextAreaElement;

    // Clear initial GET_STATUS call from init()
    vi.clearAllMocks();

    textarea.value = 'Fill the registration form';

    // Dispatch Shift+Enter -> should NOT send
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true });
    textarea.dispatchEvent(shiftEnter);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    // Dispatch plain Enter -> SHOULD send
    const plainEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, bubbles: true });
    textarea.dispatchEvent(plainEnter);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'START_TASK', payload: 'Fill the registration form' })
    );

    // User message should appear in chat
    const body = shadow.getElementById('privai-chat-body');
    expect(body?.textContent).toContain('Fill the registration form');
    // Thinking indicator should appear
    expect(shadow.getElementById('privai-thinking-indicator')).not.toBeNull();
  });

  it('provides immediate local greeting echo for hello', async () => {
    vi.useFakeTimers();
    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;
    const textarea = shadow.getElementById('privai-input') as HTMLTextAreaElement;

    textarea.value = 'hello';
    const plainEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, bubbles: true });
    textarea.dispatchEvent(plainEnter);

    vi.advanceTimersByTime(200);

    const body = shadow.getElementById('privai-chat-body');
    expect(body?.textContent).toContain('hello');
    expect(body?.textContent).toContain('The chat interface is working');
    vi.useRealTimers();
  });

  it('supports 30 test messages generation for independent scrolling', () => {
    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;

    widget.generate30TestMessages();

    const body = shadow.getElementById('privai-chat-body');
    const bubbles = shadow.querySelectorAll('.message-bubble');
    expect(bubbles.length).toBe(30);
    expect(body?.textContent).toContain('User request message #1:');
    expect(body?.textContent).toContain('AI response #15:');
  });

  it('handles state updates sequentially without duplicate messages', () => {
    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;

    const state = {
      agentState: 'EXECUTING',
      redactedRegions: 3,
      timeline: [
        { timestamp: 1000, label: 'Agent Initialized' },
        { timestamp: 2000, label: 'PRIVACY PASSED', detail: '3 sensitive regions redacted' },
        { timestamp: 3000, label: 'VLM RESPONSE', detail: 'type fullname John Doe' },
      ],
    };

    // First update
    widget.updateState(state);

    const body = shadow.getElementById('privai-chat-body');
    expect(body?.textContent).toContain('Redacted 3 sensitive items');
    expect(body?.textContent).toContain('AI Reasoning: type fullname John Doe');

    // Count instances of "Redacted 3 sensitive items"
    const occurrencesBefore = (body?.innerHTML.match(/Redacted 3 sensitive items/g) || []).length;
    expect(occurrencesBefore).toBe(1);

    // Call updateState again with the SAME state (e.g. from state poll or broadcast)
    widget.updateState(state);
    const occurrencesAfter = (body?.innerHTML.match(/Redacted 3 sensitive items/g) || []).length;
    expect(occurrencesAfter).toBe(1); // No duplicates!
  });

  it('renders useful error message on failure', () => {
    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;

    widget.updateState({
      agentState: 'ERROR',
      timeline: [
        { timestamp: 4000, label: 'ERROR', detail: 'Unable to connect to AI server at http://localhost:8000' },
      ],
    });

    const body = shadow.getElementById('privai-chat-body');
    expect(body?.textContent).toContain('Unable to connect to AI server');

    const pill = shadow.getElementById('privai-status-pill');
    expect(pill?.textContent).toBe('ERROR');
  });

  it('restores chat messages and open state from sessionStorage across navigation', () => {
    // Pre-populate sessionStorage as if user was already chatting
    sessionStorage.setItem(
      'privai_chat_messages',
      JSON.stringify([
        { id: '1', sender: 'user', text: 'Previous task', timestamp: 500 },
        { id: '2', sender: 'assistant', text: 'Task completed', timestamp: 600 },
      ])
    );
    sessionStorage.setItem('privai_widget_open', 'true');

    const widget = new AssistantWidget();
    const shadow = document.getElementById('privai-assistant-root')?.shadowRoot!;
    const dialog = shadow.getElementById('privai-chat-dialog');
    const body = shadow.getElementById('privai-chat-body');

    // Dialog should open automatically
    expect(dialog?.classList.contains('open')).toBe(true);
    // Previous messages should be restored
    expect(body?.textContent).toContain('Previous task');
    expect(body?.textContent).toContain('Task completed');
  });
});

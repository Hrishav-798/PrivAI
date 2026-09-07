/**
 * PrivAI In-Page Assistant Widget
 * Injected into webpages using Shadow DOM to guarantee style isolation.
 * Provides a floating trigger button [ 🤖 PrivAI ] and a conversational chat interface.
 */
import { scanDOM } from './domScanner';
import { executeAction } from './executor';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  badge?: string;
  badgeType?: 'success' | 'warning' | 'danger' | 'info';
  timestamp: number;
}

export class AssistantWidget {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private isOpen: boolean = false;
  private isVisionOverlayActive: boolean = false;
  private failureModeActive: boolean = false;
  private messages: ChatMessage[] = [];
  private lastProcessedTimelineIndex: number = -1;
  private isThinking: boolean = false;
  private userIsNearBottom: boolean = true;
  private hasUnreadBelow: boolean = false;

  constructor() {
    this.loadStateFromStorage();
    this.init();
  }

  private loadStateFromStorage() {
    try {
      const savedMessages = sessionStorage.getItem('privai_chat_messages');
      if (savedMessages) {
        this.messages = JSON.parse(savedMessages);
      }
      const savedOpen = sessionStorage.getItem('privai_widget_open');
      if (savedOpen === 'true') {
        this.isOpen = true;
      }
    } catch {
      this.messages = [];
    }
  }

  private saveStateToStorage() {
    try {
      sessionStorage.setItem('privai_chat_messages', JSON.stringify(this.messages));
      sessionStorage.setItem('privai_widget_open', this.isOpen ? 'true' : 'false');
    } catch {}
  }

  private init() {
    // Prevent duplicate injection: maintain exactly one singleton instance per page
    if (document.getElementById('privai-assistant-root')) {
      console.log('[PrivAI Chat] Singleton instance already mounted on this page');
      return;
    }

    this.host = document.createElement('div');
    this.host.id = 'privai-assistant-root';
    this.host.style.position = 'fixed';
    this.host.style.bottom = '0';
    this.host.style.right = '0';
    this.host.style.zIndex = '2147483647';
    this.host.style.pointerEvents = 'none'; // Only widget children capture events
    document.body.appendChild(this.host);

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.render();
    this.setupListeners();

    console.log('[PrivAI Chat] Assistant widget mounted cleanly into Shadow DOM');

    // If no messages exist yet, add initial greeting
    if (this.messages.length === 0) {
      this.addMessage({
        id: 'msg_welcome',
        sender: 'assistant',
        text: 'Hello! I am PrivAI, your on-device Privacy Browser Assistant. You can ask me to fill forms, search documentation, answer questions about this page, or navigate—while ensuring zero sensitive data ever leaves your machine unredacted.',
        badge: 'Zero Raw PII Egress',
        badgeType: 'success',
        timestamp: Date.now(),
      }, true);
    } else {
      this.renderMessages(true);
    }

    // Sync initial state if service worker has an active task
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
          if (res?.success && res.data) {
            this.updateState(res.data);
          }
        });
      }
    } catch {}
  }

  private render() {
    if (!this.shadow) return;

    this.shadow.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .floating-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 12px 20px;
          border-radius: 9999px;
          border: none;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          pointer-events: auto;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }

        .floating-btn:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 12px 28px rgba(16, 185, 129, 0.5);
        }

        .floating-btn .robot-icon {
          font-size: 18px;
        }

        .floating-btn .pulse-dot {
          width: 8px;
          height: 8px;
          background-color: #34d399;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(52, 211, 153, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
        }

        .chat-dialog {
          position: fixed;
          bottom: 84px;
          right: 24px;
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 580px;
          max-height: calc(100vh - 110px);
          background: #0f172a;
          color: #f8fafc;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          pointer-events: auto;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
          transform: translateY(16px) scale(0.96);
          visibility: hidden;
          position: fixed;
        }

        .chat-dialog.open {
          opacity: 1;
          transform: translateY(0) scale(1);
          visibility: visible;
        }

        .dialog-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-pill {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-weight: 600;
          text-transform: uppercase;
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.4);
        }

        .status-pill.busy {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border-color: rgba(59, 130, 246, 0.4);
        }

        .status-pill.blocked {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.4);
        }

        .status-pill.error {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.4);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-icon {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }

        .btn-icon:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
        }

        .btn-icon.active {
          background: rgba(16, 185, 129, 0.2);
          border-color: #10b981;
          color: #10b981;
        }

        .btn-icon.active-danger {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #f87171;
        }

        .btn-close {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 16px;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;
        }

        .btn-close:hover {
          color: #f8fafc;
        }

        /* Dedicated Independent Scrollable Message Body */
        .chat-body {
          flex: 1;
          min-height: 0; /* CRITICAL: Enables flex child to scroll properly */
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain; /* Prevents outer webpage scroll jank */
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
          outline: none; /* Focusable for keyboard scroll */
        }

        .chat-body::-webkit-scrollbar {
          width: 6px;
        }
        .chat-body::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        .chat-body::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }

        .message-bubble {
          max-width: 88%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          word-break: break-word;
          white-space: pre-wrap;
          user-select: text;
        }

        .message-bubble.user {
          align-self: flex-end;
          background: #2563eb;
          color: white;
          border-bottom-right-radius: 2px;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
        }

        .message-bubble.assistant {
          align-self: flex-start;
          background: #1e293b;
          color: #e2e8f0;
          border-bottom-left-radius: 2px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .message-bubble.system {
          align-self: center;
          background: rgba(51, 65, 85, 0.6);
          color: #cbd5e1;
          font-size: 11px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .thinking-bubble {
          align-self: flex-start;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #1e293b;
          color: #94a3b8;
          border-radius: 12px;
          border-bottom-left-radius: 2px;
          padding: 8px 14px;
          font-size: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .dots-loader {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dots-loader span {
          width: 5px;
          height: 5px;
          background: #10b981;
          border-radius: 50%;
          animation: bounce 1.2s infinite ease-in-out both;
        }
        .dots-loader span:nth-child(1) { animation-delay: -0.32s; }
        .dots-loader span:nth-child(2) { animation-delay: -0.16s; }
        .dots-loader span:nth-child(3) { animation-delay: 0s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .badge-tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          margin-top: 6px;
        }
        .badge-success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
        .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .badge-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .badge-info { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }

        /* Floating Scroll to Bottom Button */
        .btn-scroll-bottom {
          position: absolute;
          bottom: 12px;
          right: 14px;
          background: #2563eb;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: transform 0.15s;
        }
        .btn-scroll-bottom:hover {
          transform: translateY(-2px);
          background: #1d4ed8;
        }

        .chips-container {
          flex-shrink: 0;
          display: flex;
          gap: 6px;
          padding: 8px 14px 4px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: #0f172a;
          overflow-x: auto;
          white-space: nowrap;
        }

        .chips-container::-webkit-scrollbar {
          height: 4px;
        }

        .chip-btn {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          font-size: 11px;
          padding: 5px 10px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .chip-btn:hover {
          background: #334155;
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.25);
        }

        .input-bar {
          flex-shrink: 0;
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 10px 14px;
          background: #1e293b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .input-textarea {
          flex: 1;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #f8fafc;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.4;
          outline: none;
          resize: none;
          max-height: 90px;
          min-height: 36px;
          transition: border-color 0.15s;
        }

        .input-textarea:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        .input-textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-send {
          background: #10b981;
          color: white;
          border: none;
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          height: 36px;
        }

        .btn-send:hover {
          background: #059669;
        }

        .btn-stop {
          background: #ef4444;
          color: white;
          border: none;
          padding: 9px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          height: 36px;
        }

        .btn-stop:hover {
          background: #dc2626;
        }

        .dialog-footer {
          flex-shrink: 0;
          padding: 7px 14px;
          background: #090d16;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          font-size: 10px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-secure {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #10b981;
          font-weight: 600;
        }
      </style>

      <!-- Floating Trigger Button -->
      <button class="floating-btn" id="privai-toggle-btn" title="Open PrivAI Assistant">
        <span class="pulse-dot"></span>
        <span class="robot-icon">🤖</span>
        <span>PrivAI</span>
      </button>

      <!-- Chat Interface Dialog -->
      <div class="chat-dialog ${this.isOpen ? 'open' : ''}" id="privai-chat-dialog">
        <div class="dialog-header">
          <div class="header-left">
            <span class="header-title">🤖 PrivAI Assistant</span>
            <span class="status-pill" id="privai-status-pill">IDLE</span>
          </div>
          <div class="header-actions">
            <button class="btn-icon" id="privai-btn-vision" title="Toggle On-Device Vision Overlay">
              👁️ Vision
            </button>
            <button class="btn-icon" id="privai-btn-failure" title="Test Hard Client Privacy Gate">
              Demo Block
            </button>
            <button class="btn-close" id="privai-btn-close" title="Close Assistant">✕</button>
          </div>
        </div>

        <!-- Scrollable Message Body with tabindex for keyboard scroll -->
        <div class="chat-body" id="privai-chat-body" tabindex="0" title="Chat Messages (Scrollable)">
          <!-- Messages rendered here -->
        </div>

        <!-- Floating Scroll to Bottom Indicator Button -->
        <button class="btn-scroll-bottom" id="privai-scroll-bottom" style="display: none;">
          ↓ New messages
        </button>

        <!-- Quick Suggestions -->
        <div class="chips-container">
          <button class="chip-btn" data-task="Fill the registration form with valid synthetic data">📝 Fill Form</button>
          <button class="chip-btn" data-task="Search for Kubernetes HPA documentation and open official result">🔍 Search Docs</button>
          <button class="chip-btn" data-task="What is this page about?">❓ What is this page?</button>
          <button class="chip-btn" data-task="Scroll down">⬇️ Scroll Down</button>
          <button class="chip-btn" data-task="__test_30_messages__">🧪 Test 30 Messages</button>
        </div>

        <div class="input-bar">
          <textarea
            class="input-textarea"
            id="privai-input"
            rows="1"
            placeholder="Ask PrivAI to perform a task or ask about this page..."
          ></textarea>
          <button class="btn-send" id="privai-btn-send">Send</button>
          <button class="btn-stop" id="privai-btn-stop" style="display: none;">Stop</button>
        </div>

        <div class="dialog-footer">
          <span class="footer-secure">🛡️ Privacy Firewall Active</span>
          <span>UltraFace ONNX • Client Redaction</span>
        </div>
      </div>
    `;
  }

  private renderMessages(forceScroll: boolean = false) {
    if (!this.shadow) return;
    const body = this.shadow.getElementById('privai-chat-body');
    if (!body) return;

    let html = this.messages
      .map((msg) => {
        let badgeHtml = '';
        if (msg.badge) {
          const typeClass = `badge-${msg.badgeType || 'info'}`;
          badgeHtml = `<div class="badge-tag ${typeClass}">${msg.badge}</div>`;
        }
        return `
          <div class="message-bubble ${msg.sender}">
            <div>${msg.text}</div>
            ${badgeHtml}
          </div>
        `;
      })
      .join('');

    if (this.isThinking) {
      html += `
        <div class="thinking-bubble" id="privai-thinking-indicator">
          <span>Thinking</span>
          <div class="dots-loader">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
    }

    body.innerHTML = html;

    // Smart Auto-Scroll:
    // If forceScroll is requested (e.g. user just sent a message or opened widget), or if user was already near bottom:
    // scroll to bottom.
    // IF USER SCROLLED UPWARD: DO NOT FORCE THEM TO THE BOTTOM!
    if (forceScroll || this.userIsNearBottom) {
      body.scrollTop = body.scrollHeight;
      this.userIsNearBottom = true;
      this.hideScrollToBottomButton();
    } else {
      // User is viewing older messages above
      this.showScrollToBottomButton();
    }
  }

  private showScrollToBottomButton() {
    if (!this.shadow) return;
    const btn = this.shadow.getElementById('privai-scroll-bottom');
    if (btn) btn.style.display = 'flex';
  }

  private hideScrollToBottomButton() {
    if (!this.shadow) return;
    const btn = this.shadow.getElementById('privai-scroll-bottom');
    if (btn) btn.style.display = 'none';
  }

  private scrollToBottom() {
    if (!this.shadow) return;
    const body = this.shadow.getElementById('privai-chat-body');
    if (body) {
      if (typeof body.scrollTo === 'function') {
        body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
      } else {
        body.scrollTop = body.scrollHeight;
      }
      this.userIsNearBottom = true;
      this.hideScrollToBottomButton();
    }
  }

  private addMessage(msg: ChatMessage, forceScroll: boolean = false) {
    this.messages.push(msg);
    this.saveStateToStorage();
    this.renderMessages(forceScroll);
  }

  private setupListeners() {
    if (!this.shadow) return;

    const toggleBtn = this.shadow.getElementById('privai-toggle-btn');
    const closeBtn = this.shadow.getElementById('privai-btn-close');
    const dialog = this.shadow.getElementById('privai-chat-dialog');
    const sendBtn = this.shadow.getElementById('privai-btn-send');
    const stopBtn = this.shadow.getElementById('privai-btn-stop');
    const textarea = this.shadow.getElementById('privai-input') as HTMLTextAreaElement;
    const visionBtn = this.shadow.getElementById('privai-btn-vision');
    const failureBtn = this.shadow.getElementById('privai-btn-failure');
    const body = this.shadow.getElementById('privai-chat-body');
    const scrollBottomBtn = this.shadow.getElementById('privai-scroll-bottom');

    // Track user scroll position so we do NOT force them back down if they scrolled up!
    body?.addEventListener('scroll', () => {
      if (!body) return;
      const distanceFromBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
      // Consider user at bottom if within 60px of the end
      this.userIsNearBottom = distanceFromBottom <= 60;
      if (this.userIsNearBottom) {
        this.hideScrollToBottomButton();
      }
    });

    scrollBottomBtn?.addEventListener('click', () => {
      this.scrollToBottom();
    });

    toggleBtn?.addEventListener('click', () => {
      this.toggleDialog();
    });

    closeBtn?.addEventListener('click', () => {
      this.toggleDialog(false);
    });

    const submitTask = () => {
      const text = textarea?.value?.trim();
      if (!text) return;
      textarea.value = '';
      textarea.style.height = 'auto';
      this.startAgent(text);
    };

    sendBtn?.addEventListener('click', submitTask);

    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter creates a new line
          return;
        } else {
          // Enter submits message
          e.preventDefault();
          submitTask();
        }
      }
    });

    // Auto-resize textarea as user types
    textarea?.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 90)}px`;
    });

    stopBtn?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'STOP_TASK' });
      }
      this.isThinking = false;
      this.addMessage({
        id: `stop_${Date.now()}`,
        sender: 'system',
        text: 'Agent task stopped by user.',
        timestamp: Date.now(),
      }, true);
      this.setRunning(false);
    });

    visionBtn?.addEventListener('click', () => {
      this.isVisionOverlayActive = !this.isVisionOverlayActive;
      visionBtn.classList.toggle('active', this.isVisionOverlayActive);
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
          const detections = res?.data?.lastVisionDetections || [];
          window.postMessage(
            {
              source: 'privai-widget',
              action: 'TOGGLE_VISION',
              show: this.isVisionOverlayActive,
              detections,
            },
            '*'
          );
        });
      }
    });

    failureBtn?.addEventListener('click', () => {
      this.failureModeActive = !this.failureModeActive;
      failureBtn.classList.toggle('active-danger', this.failureModeActive);
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SET_FAILURE_MODE',
          payload: this.failureModeActive,
        });
      }
      this.addMessage({
        id: `demo_${Date.now()}`,
        sender: 'system',
        text: this.failureModeActive
          ? '🚨 Demo Mode Enabled: Will simulate unredacted PII leak to verify Hard Privacy Gate blockage.'
          : '🛡️ Demo Mode Disabled: Normal privacy protection active.',
        timestamp: Date.now(),
      }, true);
    });

    // Quick suggestion chips
    const chips = this.shadow.querySelectorAll('.chip-btn');
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const task = (e.currentTarget as HTMLElement).getAttribute('data-task');
        if (task === '__test_30_messages__') {
          this.generate30TestMessages();
        } else if (task) {
          this.startAgent(task);
        }
      });
    });
  }

  public toggleDialog(open?: boolean) {
    if (!this.shadow) return;
    const dialog = this.shadow.getElementById('privai-chat-dialog');
    const textarea = this.shadow.getElementById('privai-input') as HTMLTextAreaElement;
    this.isOpen = open !== undefined ? open : !this.isOpen;
    dialog?.classList.toggle('open', this.isOpen);
    this.saveStateToStorage();
    if (this.isOpen) {
      this.scrollToBottom();
      if (textarea) setTimeout(() => textarea.focus(), 100);
    }
  }

  /**
   * Generates 30 sequential messages to test vertical scrolling, mouse-wheel,
   * trackpad, Page Up/Down, and scrollbar dragging independently.
   */
  public generate30TestMessages() {
    console.log('[PrivAI Chat] Generating 30 test conversation messages for scroll verification');
    this.messages = [];
    for (let i = 1; i <= 15; i++) {
      this.messages.push({
        id: `test_usr_${i}`,
        sender: 'user',
        text: `User request message #${i}: Testing chat scrolling and history recall.`,
        timestamp: Date.now() - (16 - i) * 60000,
      });
      this.messages.push({
        id: `test_ai_${i}`,
        sender: 'assistant',
        text: `AI response #${i}: Understood. Action planned and verified on-device. Zero sensitive data leaves the browser.`,
        badge: i % 2 === 0 ? 'Safe to Transmit' : undefined,
        badgeType: 'success',
        timestamp: Date.now() - (16 - i) * 60000 + 1000,
      });
    }
    this.saveStateToStorage();
    this.renderMessages(true);
  }

  private startAgent(task: string) {
    console.log('[PrivAI Chat] User submitted task (characters: %d)', task.length);

    // Add user message and scroll to bottom
    this.addMessage({
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: task,
      timestamp: Date.now(),
    }, true);

    // Section 2: Direct Local Echo & Quick Greetings
    const taskLower = task.trim().toLowerCase();
    const isGreeting = /^(hi+|hello+|hey+|hola|greetings?|ping|test)\b/i.test(taskLower);
    if (isGreeting) {
      setTimeout(() => {
        this.addMessage({
          id: `greet_${Date.now()}`,
          sender: 'assistant',
          text: 'Hello! The chat interface is working. How can I help you on this page?',
          badge: 'Ready',
          badgeType: 'success',
          timestamp: Date.now(),
        }, true);
      }, 100);
      return;
    }

    if (taskLower === 'test scroll' || taskLower === 'test 30') {
      this.generate30TestMessages();
      return;
    }

    // Normal multi-step agent flow
    this.isThinking = true;
    this.renderMessages(true);
    this.setRunning(true);

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_TASK', payload: task });
    } else {
      this.isThinking = false;
      this.addMessage({
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: 'PrivAI requires the Chrome extension background service to sanitize page data locally before transmission. Direct unredacted network requests from webpage context are strictly prohibited.',
        badge: 'Privacy Gate',
        badgeType: 'warning',
        timestamp: Date.now(),
      }, true);
      this.setRunning(false);
    }
  }

  public setRunning(running: boolean) {
    if (!this.shadow) return;
    const sendBtn = this.shadow.getElementById('privai-btn-send');
    const stopBtn = this.shadow.getElementById('privai-btn-stop');
    const textarea = this.shadow.getElementById('privai-input') as HTMLTextAreaElement;

    if (sendBtn && stopBtn && textarea) {
      sendBtn.style.display = running ? 'none' : 'block';
      stopBtn.style.display = running ? 'block' : 'none';
      textarea.disabled = running;
      if (!running) {
        setTimeout(() => textarea.focus(), 100);
      }
    }
  }

  public updateState(state: any) {
    if (!this.shadow || !state) return;

    // Update status pill
    const pill = this.shadow.getElementById('privai-status-pill');
    if (pill) {
      pill.textContent = state.agentState;
      pill.className = 'status-pill';
      if (state.agentState === 'NETWORK_BLOCKED') {
        pill.classList.add('blocked');
      } else if (state.agentState === 'ERROR') {
        pill.classList.add('error');
      } else if (state.agentState !== 'IDLE' && state.agentState !== 'COMPLETED') {
        pill.classList.add('busy');
      }
    }

    const isRunning =
      state.agentState !== 'IDLE' &&
      state.agentState !== 'COMPLETED' &&
      state.agentState !== 'ERROR' &&
      state.agentState !== 'NETWORK_BLOCKED';

    if (!isRunning) {
      this.isThinking = false;
    }
    this.setRunning(isRunning);

    // Process new timeline entries sequentially without dropping or duplicating
    if (state.timeline && Array.isArray(state.timeline)) {
      // CRITICAL: When a new task starts, state.timeline is reset. Reset our tracking index!
      if (state.timeline.length <= this.lastProcessedTimelineIndex) {
        this.lastProcessedTimelineIndex = -1;
      }

      for (let i = this.lastProcessedTimelineIndex + 1; i < state.timeline.length; i++) {
        const event = state.timeline[i];
        this.lastProcessedTimelineIndex = i;

        if (!event || !event.label) continue;

        if (event.label === 'PRIVACY PASSED') {
          // Only show privacy note if sensitive items were actually redacted to keep chat clean
          if (state.redactedRegions && state.redactedRegions > 0) {
            this.addMessage({
              id: `evt_${Date.now()}_${i}`,
              sender: 'assistant',
              text: `🛡️ Local Privacy Engine: Redacted ${state.redactedRegions} sensitive items locally before network transmission.`,
              badge: 'Safe to Transmit',
              badgeType: 'success',
              timestamp: event.timestamp || Date.now(),
            });
          }
        } else if (event.label === 'AI ANSWER') {
          this.isThinking = false;
          this.addMessage({
            id: `ans_${Date.now()}_${i}`,
            sender: 'assistant',
            text: event.detail || 'Done.',
            badge: 'Verified On-Device',
            badgeType: 'success',
            timestamp: event.timestamp || Date.now(),
          });
        } else if (event.label === 'PRIVACY GATE BLOCKED' || event.label === 'NETWORK BLOCKED') {
          this.isThinking = false;
          this.addMessage({
            id: `evt_${Date.now()}_${i}`,
            sender: 'assistant',
            text: event.detail || "⚠️ Privacy Notice: This field looks like it contains sensitive information I can't process safely — please handle it manually.",
            badge: 'Manual Input Required',
            badgeType: 'warning',
            timestamp: event.timestamp || Date.now(),
          });
        } else if (event.label === 'VLM RESPONSE') {
          // Do not show robotic "Action: read_page" cards to user
          if (event.detail && !event.detail.includes('read_page')) {
            this.addMessage({
              id: `vlm_${Date.now()}_${i}`,
              sender: 'assistant',
              text: `🧠 AI Reasoning: ${event.detail}`,
              badge: 'AI Plan',
              badgeType: 'info',
              timestamp: event.timestamp || Date.now(),
            });
          }
        } else if (event.label === 'ACTION EXECUTED') {
          // Suppress developer noise like "Executing read_page"
          if (event.detail && !event.detail.includes('read_page')) {
            this.addMessage({
              id: `act_${Date.now()}_${i}`,
              sender: 'assistant',
              text: `⚡ ${event.detail}`,
              badge: 'Action Success',
              badgeType: 'success',
              timestamp: event.timestamp || Date.now(),
            });
          }
        } else if (event.label === 'TASK COMPLETED') {
          this.isThinking = false;
          const hasAnswerAlready = this.messages.some((m) => m.id.startsWith('ans_'));
          if (!hasAnswerAlready && event.detail && event.detail !== 'Task completed') {
            this.addMessage({
              id: `done_${Date.now()}_${i}`,
              sender: 'assistant',
              text: `✅ ${event.detail}`,
              badge: 'Completed',
              badgeType: 'success',
              timestamp: event.timestamp || Date.now(),
            });
          }
        } else if (event.label === 'ERROR') {
          this.isThinking = false;
          this.addMessage({
            id: `err_${Date.now()}_${i}`,
            sender: 'assistant',
            text: `⚠️ Execution Error: ${event.detail || 'An unexpected error occurred.'}`,
            badge: 'Error',
            badgeType: 'danger',
            timestamp: event.timestamp || Date.now(),
          });
        }
      }
    }

    this.renderMessages();
  }

  public handlePrivacyBlocked(payload?: any) {
    this.isThinking = false;
    const guidance = payload?.message || "⚠️ Privacy Notice: This field looks like it contains sensitive information I can't process safely — please handle it manually.";
    this.addMessage({
      id: `gate_block_${Date.now()}`,
      sender: 'assistant',
      text: guidance,
      badge: 'Manual Input Required',
      badgeType: 'warning',
      timestamp: Date.now(),
    });
    if (!this.isOpen) {
      this.toggleDialog();
    }
  }
}

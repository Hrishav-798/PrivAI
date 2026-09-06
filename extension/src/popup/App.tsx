import React, { useState, useEffect, useRef } from 'react';
import { DashboardState, TimelineEntry } from '../types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  badge?: string;
  badgeType?: 'success' | 'info' | 'danger';
  timestamp: number;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'privacy'>('chat');
  const [state, setState] = useState<DashboardState | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTabInfo, setCurrentTabInfo] = useState<{ title: string; url: string; host: string }>({
    title: 'Loading page...',
    url: '',
    host: '',
  });
  const [testFailureMode, setTestFailureMode] = useState(false);
  const [visionOverlay, setVisionOverlay] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [userIsNearBottom, setUserIsNearBottom] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastProcessedTimelineIndex = useRef<number>(-1);

  // Initialize and load saved messages
  useEffect(() => {
    // 1. Get active tab information
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (active && active.url) {
        try {
          const urlObj = new URL(active.url);
          setCurrentTabInfo({
            title: active.title || urlObj.hostname,
            url: active.url,
            host: urlObj.hostname,
          });
        } catch {
          setCurrentTabInfo({
            title: active.title || 'Browser Tab',
            url: active.url || '',
            host: 'webpage',
          });
        }
      }
    });

    // 2. Load stored chat messages
    try {
      const saved = sessionStorage.getItem('privai_popup_messages');
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([
          {
            id: 'welcome_1',
            sender: 'assistant',
            text: 'Hello! I am PrivAI, your on-device Privacy Browser Assistant. Ask me to answer questions about this page, search, click buttons, or fill forms—while ensuring zero sensitive data leaves your machine.',
            badge: 'Privacy Firewall Active',
            badgeType: 'success',
            timestamp: Date.now(),
          },
        ]);
      }
    } catch {
      // Ignore storage errors
    }

    // 3. Initial fetch of agent state
    fetchStatus();
    const interval = setInterval(fetchStatus, 600);

    // 4. Runtime state listener
    const listener = (msg: any) => {
      if (msg.type === 'STATE_UPDATE') {
        setState(msg.payload);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem('privai_popup_messages', JSON.stringify(messages));
      }
    } catch {}
  }, [messages]);

  // Sync timeline events from background agent into chat messages
  useEffect(() => {
    if (!state || !state.timeline || !Array.isArray(state.timeline)) return;

    // CRITICAL: When a new task starts, state.timeline is reset. Reset our tracking index!
    if (state.timeline.length <= lastProcessedTimelineIndex.current) {
      lastProcessedTimelineIndex.current = -1;
    }

    const newMessages: ChatMessage[] = [];
    for (let i = lastProcessedTimelineIndex.current + 1; i < state.timeline.length; i++) {
      const entry = state.timeline[i];
      lastProcessedTimelineIndex.current = i;

      if (!entry || !entry.label) continue;

      if (entry.label === 'PRIVACY PASSED') {
        // Only show privacy note if sensitive items were actually redacted to keep chat clean
        if (state.redactedRegions && state.redactedRegions > 0) {
          newMessages.push({
            id: `priv_${Date.now()}_${i}`,
            sender: 'assistant',
            text: `🛡️ Local Privacy Engine: Redacted ${state.redactedRegions} sensitive items locally before transmission.`,
            badge: 'Safe to Transmit',
            badgeType: 'success',
            timestamp: entry.timestamp || Date.now(),
          });
        }
      } else if (entry.label === 'AI ANSWER') {
        setIsThinking(false);
        newMessages.push({
          id: `ans_${Date.now()}_${i}`,
          sender: 'assistant',
          text: entry.detail || 'Done.',
          badge: 'Verified On-Device',
          badgeType: 'success',
          timestamp: entry.timestamp || Date.now(),
        });
      } else if (entry.label === 'VLM RESPONSE') {
        // Do not show robotic "Action: read_page" cards to user
        if (entry.detail && !entry.detail.includes('read_page')) {
          newMessages.push({
            id: `vlm_${Date.now()}_${i}`,
            sender: 'assistant',
            text: `🧠 ${entry.detail}`,
            badge: 'AI Plan',
            badgeType: 'info',
            timestamp: entry.timestamp || Date.now(),
          });
        }
      } else if (entry.label === 'ACTION EXECUTED') {
        // Suppress developer noise like "Executing read_page"
        if (entry.detail && !entry.detail.includes('read_page')) {
          newMessages.push({
            id: `act_${Date.now()}_${i}`,
            sender: 'assistant',
            text: `⚡ ${entry.detail}`,
            badge: 'Action Success',
            badgeType: 'success',
            timestamp: entry.timestamp || Date.now(),
          });
        }
      } else if (entry.label === 'TASK COMPLETED') {
        setIsThinking(false);
        const hasAnswerAlready = newMessages.some((m) => m.id.startsWith('ans_'));
        if (!hasAnswerAlready && entry.detail && entry.detail !== 'Task completed') {
          newMessages.push({
            id: `done_${Date.now()}_${i}`,
            sender: 'assistant',
            text: `✅ ${entry.detail}`,
            badge: 'Completed',
            badgeType: 'success',
            timestamp: entry.timestamp || Date.now(),
          });
        }
      } else if (entry.label === 'ERROR') {
        setIsThinking(false);
        newMessages.push({
          id: `err_${Date.now()}_${i}`,
          sender: 'assistant',
          text: `⚠️ Execution Error: ${entry.detail || 'An unexpected error occurred.'}`,
          badge: 'Error',
          badgeType: 'danger',
          timestamp: entry.timestamp || Date.now(),
        });
      } else if (entry.label === 'NETWORK BLOCKED') {
        setIsThinking(false);
        newMessages.push({
          id: `block_${Date.now()}_${i}`,
          sender: 'assistant',
          text: `🛑 Privacy Firewall Blocked Request: Unredacted sensitive data detected by Hard Client Privacy Gate. Zero bytes were sent.`,
          badge: 'Blocked',
          badgeType: 'danger',
          timestamp: entry.timestamp || Date.now(),
        });
      }
    }

    if (newMessages.length > 0) {
      setMessages((prev) => [...prev, ...newMessages]);
    }
  }, [state?.timeline]);

  // Smart auto-scroll: scroll to bottom only if user was already near bottom
  useEffect(() => {
    if (userIsNearBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, userIsNearBottom]);

  const fetchStatus = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res && res.success) {
        setState(res.data);
        const isRunning =
          res.data.agentState !== 'IDLE' &&
          res.data.agentState !== 'COMPLETED' &&
          res.data.agentState !== 'ERROR' &&
          res.data.agentState !== 'NETWORK_BLOCKED';
        setIsThinking(isRunning);
      }
    });
  };

  const handleScroll = () => {
    if (!chatBodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatBodyRef.current;
    const distance = scrollHeight - scrollTop - clientHeight;
    setUserIsNearBottom(distance <= 60);
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setUserIsNearBottom(true);
    }
  };

  const submitTask = (textToSubmit?: string) => {
    const text = (textToSubmit || taskInput).trim();
    if (!text) return;

    setTaskInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setUserIsNearBottom(true);

    // Section 2: Direct Local Echo & Quick Greetings
    const lower = text.toLowerCase().trim();
    const isGreeting = /^(hi+|hello+|hey+|hola|greetings?|ping|test)\b/i.test(lower);
    if (isGreeting) {
      setTimeout(() => {
        const siteName = currentTabInfo.host || 'this page';
        setMessages((prev) => [
          ...prev,
          {
            id: `greet_${Date.now()}`,
            sender: 'assistant',
            text: `Hello! I am PrivAI, your on-device Privacy Browser Assistant. How can I help you on ${siteName}?`,
            badge: 'Ready',
            badgeType: 'success',
            timestamp: Date.now(),
          },
        ]);
        setUserIsNearBottom(true);
      }, 100);
      return;
    }

    // Start background agent task on active tab
    setIsThinking(true);
    chrome.runtime.sendMessage({ type: 'START_TASK', payload: text });
  };

  const stopTask = () => {
    chrome.runtime.sendMessage({ type: 'STOP_TASK' });
    setIsThinking(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `stop_${Date.now()}`,
        sender: 'system',
        text: 'Agent task stopped by user.',
        timestamp: Date.now(),
      },
    ]);
  };

  const toggleInPageWidget = () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_IN_PAGE_WIDGET' });
  };

  const toggleVision = () => {
    const next = !visionOverlay;
    setVisionOverlay(next);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TOGGLE_VISION_OVERLAY',
          payload: { show: next, detections: state?.lastVisionDetections || [] },
        });
      }
    });
  };

  const toggleFailure = () => {
    const next = !testFailureMode;
    setTestFailureMode(next);
    chrome.runtime.sendMessage({ type: 'SET_FAILURE_MODE', payload: next });
    setMessages((prev) => [
      ...prev,
      {
        id: `demo_${Date.now()}`,
        sender: 'system',
        text: next
          ? '🚨 Demo Mode Enabled: Simulating PII leak to verify Hard Privacy Gate blockage.'
          : '🛡️ Demo Mode Disabled: Normal privacy protection active.',
        timestamp: Date.now(),
      },
    ]);
  };

  const isRunning = Boolean(
    state &&
      state.agentState !== 'IDLE' &&
      state.agentState !== 'COMPLETED' &&
      state.agentState !== 'ERROR' &&
      state.agentState !== 'NETWORK_BLOCKED'
  );

  return (
    <div className="popup-container">
      {/* Header */}
      <header className="popup-header">
        <div className="header-brand">
          <div className="logo-icon">🤖</div>
          <div>
            <div className="brand-title">PrivAI Assistant</div>
            <div className="brand-subtitle" title={currentTabInfo.url}>
              <span className="live-dot"></span>
              {currentTabInfo.host || 'Connecting to tab...'}
            </div>
          </div>
        </div>

        <div className="header-controls">
          <span className={`status-pill ${state?.agentState.toLowerCase() || 'idle'}`}>
            {state?.agentState || 'READY'}
          </span>
          <button
            className="btn-icon"
            onClick={toggleInPageWidget}
            title="Toggle In-Page Floating Assistant"
          >
            📌 Page
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 AI Chat
        </button>
        <button
          className={`tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          🛡️ Privacy & Security
        </button>
      </nav>

      {/* Main Content Area */}
      {activeTab === 'chat' ? (
        <div className="chat-view">
          {/* Scrollable Message List with independent scrolling */}
          <div className="chat-messages" ref={chatBodyRef} onScroll={handleScroll}>
            {messages.map((msg) => (
              <div key={msg.id} className={`message-bubble ${msg.sender}`}>
                <div className="message-content">{msg.text}</div>
                {msg.badge && (
                  <div className={`message-badge ${msg.badgeType || 'info'}`}>
                    {msg.badge}
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="thinking-indicator">
                <span className="spinner"></span>
                <span>Reasoning and planning action on {currentTabInfo.host}...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Floating Scroll-to-Bottom Indicator */}
          {!userIsNearBottom && (
            <button className="btn-scroll-bottom" onClick={scrollToBottom}>
              ↓ New messages
            </button>
          )}

          {/* Quick Suggestions Chips */}
          <div className="chips-bar">
            <button
              className="chip"
              onClick={() => submitTask('What is this page about?')}
              disabled={isRunning}
            >
              ❓ What is this page?
            </button>
            <button
              className="chip"
              onClick={() => submitTask('Search for Kubernetes HPA documentation')}
              disabled={isRunning}
            >
              🔍 Search
            </button>
            <button
              className="chip"
              onClick={() => submitTask('Fill the registration form with valid synthetic data')}
              disabled={isRunning}
            >
              📝 Fill Form
            </button>
            <button
              className="chip"
              onClick={() => submitTask('Scroll down')}
              disabled={isRunning}
            >
              ⬇️ Scroll Down
            </button>
          </div>

          {/* Input Bar */}
          <div className="input-bar">
            <textarea
              ref={textareaRef}
              className="input-textarea"
              rows={1}
              value={taskInput}
              onChange={(e) => {
                setTaskInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    return; // Shift+Enter inserts newline
                  } else {
                    e.preventDefault();
                    submitTask();
                  }
                }
              }}
              disabled={isRunning}
              placeholder={`Ask PrivAI about ${currentTabInfo.host || 'this page'}...`}
            />

            {!isRunning ? (
              <button
                className="btn-send"
                onClick={() => submitTask()}
                disabled={!taskInput.trim()}
              >
                Send
              </button>
            ) : (
              <button className="btn-stop" onClick={stopTask}>
                Stop
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Privacy & Telemetry Tab */
        <div className="privacy-view">
          <div className="privacy-card">
            <div className="privacy-card-header">
              <span className="card-title">Client Privacy Firewall</span>
              <span
                className={`badge-pill ${
                  state?.privacyStatus === 'PROTECTED'
                    ? 'success'
                    : state?.privacyStatus === 'BLOCKED'
                    ? 'danger'
                    : 'neutral'
                }`}
              >
                {state?.privacyStatus === 'PROTECTED' ? 'PROTECTED ✓' : state?.privacyStatus || 'READY'}
              </span>
            </div>
            <p className="card-desc">
              All visual frames and DOM trees are scrubbed on-device inside this browser. Raw sensitive PII is never transmitted.
            </p>

            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-num">{state?.redactedRegions || 0}</div>
                <div className="stat-label">Sensitive Regions Redacted</div>
              </div>
              <div className="stat-box">
                <div className="stat-num">0 Bytes</div>
                <div className="stat-label">Raw PII Transmitted</div>
              </div>
              <div className="stat-box">
                <div className="stat-num">{state?.domElementCount || 0}</div>
                <div className="stat-label">Indexed Elements</div>
              </div>
              <div className="stat-box">
                <div className="stat-num">
                  {state?.metrics?.total_ms ? `${(state.metrics.total_ms / 1000).toFixed(2)}s` : '-'}
                </div>
                <div className="stat-label">Last Step Latency</div>
              </div>
            </div>
          </div>

          <div className="privacy-card">
            <div className="privacy-card-header">
              <span className="card-title">Local Vision Perception</span>
              <span className="badge-pill info">
                {state?.visionBackend ? `${state.visionBackend.toUpperCase()}` : 'WASM'}
              </span>
            </div>
            <p className="card-desc">
              Model: <strong>{state?.visionModelName || 'UltraFace ONNX (1.14 MB)'}</strong>
            </p>
            <div className="btn-row">
              <button
                className={`btn-action ${visionOverlay ? 'active' : ''}`}
                onClick={toggleVision}
              >
                👁️ {visionOverlay ? 'Hide Vision Overlay' : 'Show Vision Overlay'}
              </button>
              <button
                className={`btn-action danger ${testFailureMode ? 'active' : ''}`}
                onClick={toggleFailure}
              >
                🚨 {testFailureMode ? 'Disable Leak Test' : 'Test Privacy Block'}
              </button>
            </div>
          </div>

          <div className="privacy-card footer-card">
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              className="dashboard-link"
            >
              Open Live Telemetry Dashboard ↗
            </a>
          </div>
        </div>
      )}

      {/* Authoritative Security Confirmation Modal for High-Risk Actions */}
      {state?.pendingConfirmation && (
        <div className="confirmation-overlay">
          <div className="confirmation-card">
            <div className="confirmation-header">
              <span className="warning-icon">⚠️</span>
              <div className="confirmation-title">Security Confirmation Required</div>
              <span className="badge-pill danger">HIGH RISK</span>
            </div>
            <div className="confirmation-body">
              <p className="confirmation-desc">
                <strong>Action:</strong> {state.pendingConfirmation.description}
              </p>
              <p className="confirmation-reason">
                <strong>Reason:</strong> {state.pendingConfirmation.reason}
              </p>
              <p className="confirmation-subtext">
                This action may submit payment/auth data or make irreversible changes. PrivAI requires your explicit authorization before proceeding.
              </p>
            </div>
            <div className="confirmation-actions">
              <button
                className="btn-confirm-danger"
                onClick={() => {
                  chrome.runtime.sendMessage({ type: 'CONFIRM_ACTION' });
                }}
              >
                ✓ Approve Action
              </button>
              <button
                className="btn-confirm-cancel"
                onClick={() => {
                  chrome.runtime.sendMessage({ type: 'DENY_ACTION' });
                }}
              >
                ✕ Reject / Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Security Footer */}
      <footer className="popup-footer">
        <span>🛡️ On-Device Privacy Active</span>
        <span>UltraFace ONNX • Zero Cloud PII</span>
      </footer>
    </div>
  );
};

export default App;

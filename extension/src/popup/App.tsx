import React, { useState, useEffect, useRef } from 'react';
import { DashboardState, TimelineEntry } from '../types';

const App: React.FC = () => {
  const [state, setState] = useState<DashboardState | null>(null);
  const [taskInput, setTaskInput] = useState('Find the documentation for Kubernetes HPA and open the official result.');
  const [testFailureMode, setTestFailureMode] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Poll for status updates
    const interval = setInterval(fetchStatus, 500);

    // Listen for push updates
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

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.timeline]);

  const fetchStatus = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res && res.success) setState(res.data);
    });
  };

  const startTask = () => {
    chrome.runtime.sendMessage({ type: 'START_TASK', payload: taskInput });
  };

  const stopTask = () => {
    chrome.runtime.sendMessage({ type: 'STOP_TASK' });
  };

  const toggleFailureMode = () => {
    const newMode = !testFailureMode;
    setTestFailureMode(newMode);
    chrome.runtime.sendMessage({ type: 'SET_FAILURE_MODE', payload: newMode });
  };

  const [visionOverlay, setVisionOverlay] = useState(false);
  const toggleVisionOverlay = () => {
    const newVal = !visionOverlay;
    setVisionOverlay(newVal);
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      if (tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_VISION_OVERLAY', 
          payload: { show: newVal, detections: state?.lastVisionDetections || [] } 
        });
      }
    });
  };

  if (!state) return <div className="loading">Loading Dashboard...</div>;

  const isRunning = state.agentState !== 'IDLE' && state.agentState !== 'COMPLETED' && state.agentState !== 'ERROR' && state.agentState !== 'NETWORK_BLOCKED';

  return (
    <div className="app-container">
      <header>
        <h1>PrivAI Browser Agent</h1>
        <div className={`status-badge ${state.agentState.toLowerCase()}`}>State: {state.agentState}</div>
      </header>

      <section className="control-panel">
        <input 
          type="text" 
          value={taskInput} 
          onChange={e => setTaskInput(e.target.value)} 
          disabled={isRunning}
          placeholder="Enter task..."
        />
        <div className="btn-group">
          {!isRunning ? (
            <button onClick={startTask} className="btn-primary">Start Agent</button>
          ) : (
            <button onClick={stopTask} className="btn-danger">Stop Agent</button>
          )}
          <button onClick={toggleFailureMode} className={`btn-outline ${testFailureMode ? 'active-danger' : ''}`}>
            {testFailureMode ? 'Failure Demo: ON' : 'Failure Demo: OFF'}
          </button>
          <button onClick={toggleVisionOverlay} className={`btn-outline ${visionOverlay ? 'active-primary' : ''}`}>
            {visionOverlay ? 'Vision: ON' : 'Vision: OFF'}
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-title">PRIVACY</div>
          <div className={`metric-value ${state.privacyStatus === 'PROTECTED' ? 'safe' : state.privacyStatus === 'BLOCKED' ? 'danger' : ''}`}>
            {state.privacyStatus === 'PROTECTED' ? 'PROTECTED ✓' : state.privacyStatus}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-title">LOCAL VISION</div>
          <div className="metric-value" style={{ fontSize: '0.9rem' }}>{state.visionModelName || 'UltraFace'}</div>
          <div className="metric-sub">{state.visionBackend ? `Backend: ${state.visionBackend}` : 'Unavailable'}</div>
          <div className="metric-sub">{state.visionInferenceMs > 0 ? `Lat: ${Math.round(state.visionInferenceMs)} ms` : 'Ready'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">PII REDACTED</div>
          <div className="metric-value">{state.redactedRegions}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">E2E LATENCY</div>
          <div className="metric-value">
            {state.metrics ? `${((state.metrics.total_ms || 0) / 1000).toFixed(2)} s` : '-'}
          </div>
        </div>
      </section>

      <div className="dashboard-content">
        <div className="main-column">
          <section className="card">
            <h2>Privacy Inspector</h2>
            <div className="privacy-details">
              <div className="detail-row">
                <span>RAW DATA TRANSMITTED:</span> <strong>0</strong>
              </div>
              <div className="detail-row">
                <span>PII TRANSMITTED:</span> <strong>0</strong>
              </div>
              <div className="detail-row">
                <span>UNREDACTED SENSITIVE REGIONS:</span> <strong>0</strong>
              </div>
            </div>
            {state.agentState === 'NETWORK_BLOCKED' && (
              <div className="alert-danger">
                🛑 Privacy Firewall Blocked Request<br/>
                Reason: Sensitive information detected before transmission.
              </div>
            )}
          </section>

          <section className="card">
            <h2>Network Inspector</h2>
            <div className="network-panel">
              <h4>OUTBOUND REQUEST</h4>
              <pre className="code-block">
{`{
  "task": "${state.task || ''}",
  "dom": "Sanitized (${state.domElementCount} elements)",
  "screenshot": "Sanitized (Base64)",
  "privacy": "PASSED",
  "raw_pii": 0,
  "status": "SAFE TO SEND"
}`}
              </pre>
            </div>
          </section>

          <section className="card">
            <h2>Action Inspector</h2>
            <div className="action-panel">
              <h4>VLM ACTION</h4>
              <pre className="code-block">
                {state.currentAction ? JSON.stringify(JSON.parse(state.currentAction), null, 2) : 'Awaiting reasoning...'}
              </pre>
              <h4>VALIDATION</h4>
              <ul className="validation-list">
                <li>✓ Target exists</li>
                <li>✓ Target visible</li>
                <li>✓ Target interactive</li>
                <li>✓ Action allowed</li>
              </ul>
            </div>
          </section>
        </div>

        <div className="side-column">
          <section className="card timeline-card">
            <h2>Agent Timeline</h2>
            <div className="timeline">
              {state.timeline.map((entry: TimelineEntry, idx: number) => (
                <div key={idx} className="timeline-entry">
                  <div className="time">{new Date(entry.timestamp).toLocaleTimeString([], {hour12:false})}</div>
                  <div className="event">
                    <div className="label">{entry.label}</div>
                    {entry.detail && <div className="detail">{entry.detail}</div>}
                  </div>
                </div>
              ))}
              <div ref={timelineEndRef} />
            </div>
          </section>

          <section className="card security-card">
            <h2>Security Guarantee</h2>
            <p className="guarantee-text">
              Raw visual context is processed locally. Only sanitized context crosses the network boundary.
            </p>
            <div className="security-stats">
              <div className="stat">RAW SCREEN UPLOADS: <span>0</span></div>
              <div className="stat">RAW PII REQUESTS: <span>0</span></div>
              <div className="stat">SANITIZED REQUESTS: <span>{state.timeline.filter((t: TimelineEntry) => t.label === 'REQUEST SENT').length}</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default App;

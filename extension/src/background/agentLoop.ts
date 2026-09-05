import {
  AgentState,
  DashboardState,
  RawContext,
  SanitizedContext,
  TimelineEntry,
  PerformanceMetrics,
  ActionResponse,
  Action,
  SensitiveRegion,
} from '../types';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { validateAction } from './actionValidator';
import { ILocalVisionModel } from '../perception/LocalVisionModel';
import { LocalVisionClient } from '../perception/LocalVisionClient';
import { mergeDetections } from '../perception/detectionMerger';

export class AgentLoop {
  private state: DashboardState;
  private isRunning: boolean = false;
  private privacyEngine: PrivacyEngine;
  private localVision: ILocalVisionModel;
  private testFailureMode: boolean = false;
  private targetTabId: number | null = null;
  private backendBaseUrl: string = 'http://localhost:8000';

  constructor() {
    this.privacyEngine = new PrivacyEngine();
    this.localVision = new LocalVisionClient();
    this.state = this.getInitialState();

    // Initialize vision model asynchronously
    this.localVision.initialize().then(() => {
      this.updateState({
        visionBackend: this.localVision.getBackend(),
        visionModelName: this.localVision.getModelName(),
      });
      this.postSystemEvent(
        'model_initialized',
        'Local Vision Model Ready',
        `UltraFace ONNX loaded via ${this.localVision.getBackend()}`
      );
      this.sendHeartbeat();
    });

    // Send periodic heartbeats to backend
    this.sendHeartbeat();
    setInterval(() => this.sendHeartbeat(), 10000);
  }

  private async sendHeartbeat() {
    try {
      await fetch(`${this.backendBaseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vision_backend: this.localVision?.getBackend() || 'wasm',
          vision_model: this.localVision?.getModelName() || 'UltraFace ONNX',
          version: '1.0.0',
        }),
      });
    } catch {}
  }

  private getInitialState(): DashboardState {
    return {
      agentState: 'IDLE',
      task: '',
      currentAction: '',
      visionBackend: 'wasm',
      visionModelName: 'UltraFace Slim ONNX (320x240)',
      visionInferenceMs: 0,
      privacyStatus: 'IDLE',
      sensitiveRegions: 0,
      redactedRegions: 0,
      networkStatus: 'IDLE',
      domElementCount: 0,
      visualRegionCount: 0,
      metrics: null,
      privacyLog: [],
      timeline: [{ timestamp: Date.now(), label: 'Agent Initialized' }],
    };
  }

  public setTestFailureMode(enabled: boolean) {
    this.testFailureMode = enabled;
  }

  public getState(): DashboardState {
    return this.state;
  }

  private updateState(partial: Partial<DashboardState>) {
    this.state = { ...this.state, ...partial };
    this.broadcastState();
  }

  private addTimelineEvent(label: string, detail?: string) {
    this.state.timeline.push({ timestamp: Date.now(), label, detail });
    this.broadcastState();
  }

  private broadcastState() {
    // Send to popup and extension pages
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE', payload: this.state }).catch(() => {});

    // Broadcast to content script in all active tabs so in-page chat UI stays synced
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'STATE_UPDATE', payload: this.state }).catch(() => {});
        }
      }
    });
  }

  private async postSystemEvent(
    event: string,
    label: string,
    detail: string = '',
    level: string = 'info'
  ) {
    try {
      await fetch(`${this.backendBaseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          label,
          detail,
          timestamp: Date.now(),
          level,
        }),
      });
    } catch {
      // Backend may be offline; silently ignore event dispatch error
    }
  }

  public stop() {
    this.isRunning = false;
    this.updateState({ agentState: 'IDLE' });
    this.addTimelineEvent('Task Stopped manually');
    this.postSystemEvent('task_stopped', 'Agent Task Stopped', 'Stopped by user');
  }

  public async startTask(task: string, tabId?: number) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.targetTabId = tabId || null;
    this.state = this.getInitialState();
    this.updateState({ task, agentState: 'CAPTURING' });
    this.addTimelineEvent('TASK START', `Goal: ${task}`);
    this.postSystemEvent('task_start', 'Agent Task Started', task);

    await this.runLoop();
  }

  private async runLoop() {
    let stepCount = 0;
    const maxSteps = 10;

    while (this.isRunning && stepCount < maxSteps) {
      stepCount++;
      try {
        await this.step();
        if (
          this.state.agentState === 'COMPLETED' ||
          this.state.agentState === 'ERROR' ||
          this.state.agentState === 'NETWORK_BLOCKED'
        ) {
          this.isRunning = false;
          break;
        }

        // Brief stabilization window after action
        await new Promise((r) => setTimeout(r, 400));
        if (this.isRunning) {
          this.updateState({ agentState: 'CAPTURING' });
          this.addTimelineEvent('NEXT STEP', `Starting step ${stepCount + 1}`);
        }
      } catch (err: any) {
        console.error(err);
        const errMsg = err?.message?.includes('fetch')
          ? `Unable to connect to AI server at ${this.backendBaseUrl}. Please ensure FastAPI backend is running.`
          : err.message || 'Unknown execution error';
        this.updateState({ agentState: 'ERROR' });
        this.addTimelineEvent('ERROR', errMsg);
        this.postSystemEvent('agent_error', 'Execution Error', errMsg, 'error');
        this.isRunning = false;
      }
    }

    if (stepCount >= maxSteps && this.isRunning) {
      this.isRunning = false;
      this.updateState({ agentState: 'COMPLETED' });
      this.addTimelineEvent('TASK COMPLETED', 'Reached maximum allowed steps for task');
    }
  }


  private async step() {
    const stepStart = performance.now();

    // 1. SCREEN CAPTURE
    this.updateState({ agentState: 'CAPTURING' });
    this.addTimelineEvent('SCREEN CAPTURE', 'Capturing visible tab');
    const captureStart = performance.now();
    const screenshotDataUrl = await this.captureVisibleTab();
    const screenshotBlob = await this.dataUrlToBlob(screenshotDataUrl);
    const captureMs = performance.now() - captureStart;
    this.postSystemEvent('screenshot_captured', 'Screenshot Captured', 'Local raw tab captured');

    // 2. LOCAL DOM PERCEPTION
    this.updateState({ agentState: 'PERCEIVING' });
    this.addTimelineEvent('LOCAL PERCEPTION', 'Extracting structured DOM elements');
    const domStart = performance.now();
    const perception = await this.getPerceptionFromTab();
    const domMs = performance.now() - domStart;

    // Normalize elements ensuring both id & element_id, type & input_type are set
    const normalizedElements = (perception.elements || []).map((el: any) => ({
      ...el,
      id: el.id || el.element_id,
      element_id: el.element_id || el.id,
      type: el.type || el.input_type || null,
      input_type: el.input_type || el.type || null,
    }));

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: screenshotBlob as any,
      dom: {
        __brand: 'RawDOM',
        elements: normalizedElements,
        title: 'Tab',
        url: 'url',
        timestamp: Date.now(),
      },
    };

    // 3. LOCAL VISION INFERENCE (ONNX Runtime Web)
    let visionDetections: any[] = [];
    let visionMs = 0;
    if (this.localVision.isReady()) {
      const vStart = performance.now();
      const imageBitmap = await createImageBitmap(rawContext.screenshot);
      visionDetections = await this.localVision.detect(
        rawContext.screenshot,
        imageBitmap.width,
        imageBitmap.height
      );
      visionMs = performance.now() - vStart;

      this.updateState({
        visionInferenceMs: this.localVision.getLastInferenceTime(),
        lastVisionDetections: visionDetections,
        visualRegionCount: visionDetections.length,
      });

      this.postSystemEvent(
        'local_vision',
        'Local ONNX Inference Completed',
        `${visionDetections.length} visual regions detected in ${this.localVision.getLastInferenceTime().toFixed(1)}ms (${this.localVision.getBackend()})`
      );
    }

    // Map vision detections to sensitive regions for face blurring
    const visionSensitiveRegions: SensitiveRegion[] = visionDetections.map((vd: any) => ({
      id: vd.id || `face_${Math.random().toString(36).slice(2, 7)}`,
      type: vd.className || 'face',
      bbox: vd.bbox,
      confidence: vd.confidence || 1.0,
      source: 'vision',
      redaction: 'blur',
    }));

    // 4. LOCAL PRIVACY ENGINE (Detect, Redact, Validate)
    this.updateState({ agentState: 'PRIVACY_SCANNING', privacyStatus: 'SCANNING' });
    this.addTimelineEvent('PRIVACY SCANNING', 'Detecting passwords, PII, and faces');

    const privacyStart = performance.now();
    let sanitizedContext: SanitizedContext;
    try {
      sanitizedContext = await this.privacyEngine.process(rawContext, visionSensitiveRegions);

      if (this.testFailureMode) {
        // Deliberately leak unredacted email to demonstrate Hard Network Gate
        sanitizedContext.dom.elements[0].text = 'leaked_raw_email@example.com';
        throw new Error('Hard Network Gate Blocked: Unredacted PII detected (Failure Demo)');
      }

      const privacyMs = performance.now() - privacyStart;

      this.updateState({
        privacyStatus: 'PROTECTED',
        sensitiveRegions: sanitizedContext.privacy.regions_detected,
        redactedRegions: sanitizedContext.privacy.regions_redacted,
        domElementCount: sanitizedContext.dom.elements.length,
      });

      this.addTimelineEvent(
        'PRIVACY PASSED',
        `${sanitizedContext.privacy.regions_redacted} regions redacted locally`
      );

      this.postSystemEvent(
        'privacy_passed',
        'Local Privacy Firewall Passed',
        `${sanitizedContext.privacy.regions_redacted} sensitive regions sanitized locally in ${privacyMs.toFixed(1)}ms. Request ALLOWED.`
      );
    } catch (err: any) {
      this.updateState({
        agentState: 'NETWORK_BLOCKED',
        privacyStatus: 'BLOCKED',
        networkStatus: 'BLOCKED',
      });
      this.addTimelineEvent('NETWORK BLOCKED', err.message);
      this.postSystemEvent(
        'request_blocked',
        'NETWORK REQUEST BLOCKED',
        err.message,
        'error'
      );
      return;
    }

    // 5. SERVER-SIDE REASONING (FastAPI + Ollama VLM)
    this.updateState({ agentState: 'SENDING', networkStatus: 'SAFE' });
    this.addTimelineEvent('REQUEST SENT', 'Transmitting sanitized context only to FastAPI');

    const networkStart = performance.now();
    const actionResponse = await this.sendToBackend(sanitizedContext, this.state.task);
    const networkMs = performance.now() - networkStart;

    this.updateState({ agentState: 'REASONING' });
    this.addTimelineEvent(
      'VLM RESPONSE',
      `Action: ${actionResponse.action.action} (${actionResponse.reasoning || ''})`
    );

    this.postSystemEvent(
      'action_planned',
      'VLM Action Planned',
      `Action: ${actionResponse.action.action}, Target: ${actionResponse.action.target || 'none'}`
    );

    // 6. ACTION VALIDATION
    this.updateState({ agentState: 'ACTION_VALIDATING' });
    const valStart = performance.now();
    try {
      validateAction(actionResponse.action, sanitizedContext.dom.elements);
      this.addTimelineEvent('ACTION VALIDATED', 'Security validation passed');
    } catch (err: any) {
      this.addTimelineEvent('ACTION REJECTED', err.message);
      this.postSystemEvent('action_rejected', 'Action Rejected', err.message, 'warning');
      throw new Error(`Action validation failed: ${err.message}`);
    }
    const valMs = performance.now() - valStart;

    if (actionResponse.action.action === 'read_page') {
      this.updateState({ agentState: 'COMPLETED' });
      this.addTimelineEvent('AI ANSWER', actionResponse.reasoning || 'I observed the page and it matches your request.');
      this.addTimelineEvent('TASK COMPLETED', 'Task completed');
      this.postSystemEvent('task_completed', 'Task Completed', 'read_page reached');
      return;
    }

    // 7. BROWSER ACTION EXECUTION
    this.updateState({
      agentState: 'EXECUTING',
      currentAction: JSON.stringify(actionResponse.action),
    });
    const actionDesc =
      actionResponse.action.action === 'type'
        ? `Typing "${actionResponse.action.text || ''}"`
        : actionResponse.action.action === 'click'
        ? `Clicking ${actionResponse.action.target || 'element'}`
        : actionResponse.action.action === 'scroll'
        ? `Scrolling ${actionResponse.action.direction || 'down'}`
        : `Executing ${actionResponse.action.action}`;

    this.addTimelineEvent('ACTION EXECUTED', actionDesc);

    const execStart = performance.now();
    let execSuccess = true;
    let execError: string | undefined = undefined;

    try {
      await this.executeActionInTab(actionResponse.action);
      this.addTimelineEvent('PAGE UPDATED', 'Action executed in browser tab');
    } catch (err: any) {
      execSuccess = false;
      execError = err.message;
      this.addTimelineEvent('ACTION FAILED', err.message);
    }
    const execMs = performance.now() - execStart;
    const totalMs = performance.now() - stepStart;

    // Record metrics
    const metrics: PerformanceMetrics = {
      capture_ms: captureMs,
      vision_ms: visionMs,
      privacy_ms: domMs,
      redaction_ms: sanitizedContext.privacy.scan_ms,
      network_ms: networkMs,
      vlm_ms: actionResponse.confidence,
      validation_ms: valMs,
      execution_ms: execMs,
      total_ms: totalMs,
    };
    this.updateState({ metrics });

    // Send execution result back to backend for dashboard telemetry
    try {
      await fetch(`${this.backendBaseUrl}/api/agent/execute-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionResponse.action,
          success: execSuccess,
          error: execError,
          metrics,
        }),
      });
    } catch {}
  }

  // --- Helper Methods ---

  private async captureVisibleTab(): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(dataUrl);
      });
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:image/png;base64,${btoa(binary)}`;
  }

  private async resolveActiveTabId(): Promise<number> {
    if (this.targetTabId) return this.targetTabId;
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs[0]?.id;
        if (!id) return reject(new Error('No active browser tab found'));
        resolve(id);
      });
    });
  }

  private async ensureContentScriptInjected(tabId: number): Promise<void> {
    const isAlive = await new Promise<boolean>((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (isAlive) return;

    try {
      console.log(`[PrivAI] Auto-injecting content script into tab ${tabId}...`);
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content-script.js'],
      });
      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      console.warn(`[PrivAI] Script injection note: ${err?.message}`);
    }
  }

  private async getPerceptionFromTab(): Promise<any> {
    const tabId = await this.resolveActiveTabId();
    await this.ensureContentScriptInjected(tabId);

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' }, async (response) => {
        if (chrome.runtime.lastError) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content/content-script.js'],
            });
            await new Promise((r) => setTimeout(r, 250));
            chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' }, (retryRes) => {
              if (chrome.runtime.lastError || !retryRes || !retryRes.success) {
                return reject(
                  new Error(
                    `Could not connect to this page. Please refresh this tab (F5) once so Chrome attaches the extension.`
                  )
                );
              }
              resolve(retryRes.data);
            });
          } catch (e: any) {
            return reject(
              new Error(
                `Could not connect to this page. Please refresh this tab (F5) once so Chrome attaches the extension.`
              )
            );
          }
          return;
        }

        if (!response || !response.success)
          return reject(new Error(response?.error || 'Page DOM scan failed'));
        resolve(response.data);
      });
    });
  }

  private async executeActionInTab(action: Action): Promise<void> {
    const tabId = await this.resolveActiveTabId();
    await this.ensureContentScriptInjected(tabId);

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'EXECUTE_ACTION', payload: action },
        async (response) => {
          if (chrome.runtime.lastError) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/content-script.js'],
              });
              await new Promise((r) => setTimeout(r, 250));
              chrome.tabs.sendMessage(
                tabId,
                { type: 'EXECUTE_ACTION', payload: action },
                (retryRes) => {
                  if (chrome.runtime.lastError || !retryRes || !retryRes.success) {
                    return reject(
                      new Error(retryRes?.error || chrome.runtime.lastError?.message || 'Action execution failed')
                    );
                  }
                  resolve();
                }
              );
            } catch (e: any) {
              return reject(new Error(chrome.runtime.lastError.message || e.message));
            }
            return;
          }
          if (!response || !response.success)
            return reject(new Error(response?.error || 'Action execution failed'));
          resolve();
        }
      );
    });
  }


  private async sendToBackend(
    sanitized: SanitizedContext,
    task: string
  ): Promise<ActionResponse> {
    const screenshotBase64 = await this.blobToBase64(sanitized.screenshot as unknown as Blob);

    const payload = {
      task,
      screen: { width: 1440, height: 900 },
      sanitized_dom: sanitized.dom.elements,
      redactions: sanitized.redactions,
      privacy: sanitized.privacy,
      sanitized_screenshot: screenshotBase64,
      page_title: (sanitized.dom as any)?.pageTitle || '',
      page_url: (sanitized.dom as any)?.pageUrl || '',
    };

    const res = await fetch(`${this.backendBaseUrl}/api/agent/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`FastAPI server returned ${res.status}: ${errTxt}`);
    }

    return await res.json();
  }
}

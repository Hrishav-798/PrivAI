/**
 * PrivAI — Agent Loop
 *
 * Orchestrates the agent pipeline with a Planner → Navigator → Validator architecture.
 * Maintains page state, step history for multi-step context, supports action risk
 * classification and user confirmation, and integrates the DOM scanner with semantic
 * page representation and client-side privacy validation.
 */

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
  StepHistoryEntry,
  ConfirmationRequest,
  PageState,
} from '../types';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { validateAction, classifyActionRisk, buildConfirmationRequest } from './actionValidator';
import { ILocalVisionModel } from '../perception/LocalVisionModel';
import { LocalVisionClient } from '../perception/LocalVisionClient';
import { LocalTextDetector, ILocalTextDetector } from '../perception/LocalTextDetector';
import { mergeDetections } from '../perception/detectionMerger';
import { isGreeting, isReadOnlyTask, isTaskLikelyComplete, buildStepHistorySummary } from './agentPlanner';
import { validateActionResult, getStatusEmoji } from './agentValidator';
import { RemoteContextClient } from '../network/RemoteContextClient';
import { TransmissionGate, PrivacyViolationError } from '../network/TransmissionGate';

export class AgentLoop {
  private state: DashboardState;
  private isRunning: boolean = false;
  private privacyEngine: PrivacyEngine;
  private localVision: ILocalVisionModel;
  private localTextDetector: ILocalTextDetector;
  private remoteClient: RemoteContextClient;
  private testFailureMode: boolean = false;
  private targetTabId: number | null = null;
  private backendBaseUrl: string = 'http://localhost:8000';
  private stepHistory: StepHistoryEntry[] = [];
  private currentStep: number = 0;
  private pendingConfirmationResolve: ((confirmed: boolean) => void) | null = null;

  constructor() {
    this.privacyEngine = new PrivacyEngine();
    this.localVision = new LocalVisionClient();
    this.localTextDetector = new LocalTextDetector();
    this.remoteClient = new RemoteContextClient(this.backendBaseUrl);
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

    // Initialize pixel text detector asynchronously
    this.localTextDetector.initialize().then(() => {
      this.postSystemEvent(
        'model_initialized',
        'Local Text Detector Ready',
        `Pixel text-region detector loaded via ${this.localTextDetector.getBackend()}`
      );
    }).catch(() => {});

    // Send periodic heartbeats to backend
    this.sendHeartbeat();
    setInterval(() => this.sendHeartbeat(), 10000);
  }

  private async sendHeartbeat() {
    try {
      await this.remoteClient.sendHeartbeat({
        vision_backend: this.localVision?.getBackend() || 'wasm',
        vision_model: this.localVision?.getModelName() || 'UltraFace ONNX',
        version: '1.0.0',
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
      stepHistory: [],
      currentStep: 0,
    };
  }

  public setTestFailureMode(enabled: boolean) {
    this.testFailureMode = enabled;
  }

  public getState(): DashboardState {
    return this.state;
  }

  /**
   * Handle user confirming or denying a high-risk action.
   */
  public resolveConfirmation(confirmed: boolean) {
    if (this.pendingConfirmationResolve) {
      this.pendingConfirmationResolve(confirmed);
      this.pendingConfirmationResolve = null;
    }
  }

  private updateState(partial: Partial<DashboardState>) {
    this.state = { ...this.state, ...partial };
    // Add status message emoji
    if (partial.agentState) {
      this.state.statusMessage = getStatusEmoji(partial.agentState);
    }
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
      await this.remoteClient.postSystemEvent(event, label, detail, level);
    } catch {
      // Backend may be offline; silently ignore event dispatch error
    }
  }

  public stop() {
    this.isRunning = false;
    this.updateState({ agentState: 'IDLE', pendingConfirmation: undefined });
    this.addTimelineEvent('Task Stopped manually');
    this.postSystemEvent('task_stopped', 'Agent Task Stopped', 'Stopped by user');
    // Reject any pending confirmation
    if (this.pendingConfirmationResolve) {
      this.pendingConfirmationResolve(false);
      this.pendingConfirmationResolve = null;
    }
  }

  public async startTask(task: string, tabId?: number) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.targetTabId = tabId || null;
    this.stepHistory = [];
    this.currentStep = 0;
    this.state = this.getInitialState();
    this.updateState({ task, agentState: 'PLANNING' });
    this.addTimelineEvent('TASK START', `Goal: ${task}`);
    this.postSystemEvent('task_start', 'Agent Task Started', task);

    await this.runLoop();
  }

  private async runLoop() {
    const maxSteps = 25;

    while (this.isRunning && this.currentStep < maxSteps) {
      this.currentStep++;
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

        // Check if task is likely complete based on history
        if (isTaskLikelyComplete(this.state.task, this.stepHistory)) {
          this.isRunning = false;
          this.updateState({ agentState: 'COMPLETED' });
          this.addTimelineEvent('TASK COMPLETED', 'Agent determined task is complete');
          break;
        }

        // Brief stabilization window after action
        await new Promise((r) => setTimeout(r, 400));
        if (this.isRunning) {
          this.updateState({
            agentState: 'CAPTURING',
            currentStep: this.currentStep,
          });
          this.addTimelineEvent('NEXT STEP', `Starting step ${this.currentStep + 1}`);
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

    if (this.currentStep >= maxSteps && this.isRunning) {
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

    // 2. LOCAL DOM PERCEPTION (with full page state)
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

    // Extract real page state from perception data
    const pageUrl = perception.pageUrl || perception.pageState?.url || '';
    const pageTitle = perception.pageTitle || perception.pageState?.title || '';

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: screenshotBlob as any,
      dom: {
        __brand: 'RawDOM',
        elements: normalizedElements,
        title: pageTitle,
        url: pageUrl,
        timestamp: Date.now(),
        pageState: perception.pageState,
        semanticTree: perception.semanticTree,
      },
    };

    // 3. LOCAL VISION INFERENCE (ONNX Runtime Web: Face + Pixel Text Region Detection)
    let visionDetections: any[] = [];
    let textDetections: any[] = [];
    let visionMs = 0;
    if (this.localVision.isReady()) {
      const vStart = performance.now();
      const imageBitmap = await createImageBitmap(rawContext.screenshot);
      visionDetections = await this.localVision.detect(
        rawContext.screenshot,
        imageBitmap.width,
        imageBitmap.height
      );

      if (this.localTextDetector.isReady()) {
        try {
          textDetections = await this.localTextDetector.detectTextRegions(
            rawContext.screenshot,
            imageBitmap.width,
            imageBitmap.height
          );
        } catch (textErr) {
          console.warn('[PrivAI] Pixel text detection note:', textErr);
        }
      }

      visionMs = performance.now() - vStart;
      const combinedDetections = [...visionDetections, ...textDetections];

      this.updateState({
        visionInferenceMs: this.localVision.getLastInferenceTime() + this.localTextDetector.getLastInferenceTime(),
        lastVisionDetections: combinedDetections,
        visualRegionCount: combinedDetections.length,
      });

      this.postSystemEvent(
        'local_vision',
        'Local ONNX & Pixel Vision Inference Completed',
        `${visionDetections.length} faces, ${textDetections.length} visual text regions in ${visionMs.toFixed(1)}ms (${this.localVision.getBackend()})`
      );
    }

    // Map vision detections to sensitive regions for face blurring and visual text masking
    const visionSensitiveRegions: SensitiveRegion[] = [
      ...visionDetections.map((vd: any) => ({
        id: vd.id || `face_${Math.random().toString(36).slice(2, 7)}`,
        type: vd.className || 'face',
        bbox: vd.bbox,
        confidence: vd.confidence || 1.0,
        source: 'vision' as const,
        redaction: 'blur' as const,
      })),
      ...textDetections.map((td: any) => ({
        id: td.id || `pixel_text_${Math.random().toString(36).slice(2, 7)}`,
        type: td.className || 'visual_text_region',
        bbox: td.bbox,
        confidence: td.confidence || 0.9,
        source: 'vision' as const,
        redaction: 'mask' as const,
      })),
    ];

    // 4. LOCAL PRIVACY ENGINE (Detect, Redact, Validate)
    this.updateState({ agentState: 'PRIVACY_SCANNING', privacyStatus: 'SCANNING' });
    this.addTimelineEvent('PRIVACY SCANNING', 'Detecting passwords, PII, API keys, cards, and secrets');

    const privacyStart = performance.now();
    let sanitizedContext: SanitizedContext;
    try {
      sanitizedContext = await this.privacyEngine.process(rawContext, visionSensitiveRegions);

      if (this.testFailureMode) {
        // Deliberately corrupt sanitized context to verify TransmissionGate blocks transmission
        sanitizedContext.dom.elements[0].text = 'leaked_raw_email@example.com';
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
        `${sanitizedContext.privacy.regions_redacted} sensitive regions sanitized locally in ${privacyMs.toFixed(1)}ms. Context ready for transmission gate.`
      );
    } catch (err: any) {
      this.updateState({
        agentState: 'NETWORK_BLOCKED',
        privacyStatus: 'BLOCKED',
        networkStatus: 'BLOCKED',
      });
      const guidance = "⚠️ Privacy Notice: This field looks like it contains sensitive information I can't process safely — please handle it manually.";
      this.addTimelineEvent('PRIVACY GATE BLOCKED', guidance);
      this.postSystemEvent(
        'request_blocked',
        'PRIVACY GATE BLOCKED',
        guidance,
        'error'
      );

      // Gracefully notify active tab assistant widget to render guidance card
      if (this.targetTabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        try {
          chrome.tabs.sendMessage(this.targetTabId, {
            type: 'PRIVACY_GATE_BLOCKED',
            payload: {
              message: guidance,
              reason: err.message,
              step: this.currentStep,
            },
          }, () => {});
        } catch {}
      }

      this.isRunning = false;
      return;
    }

    // 5. TRANSMISSION GATE & SERVER-SIDE REASONING (via RemoteContextClient)
    this.updateState({ agentState: 'SENDING', networkStatus: 'SAFE' });
    this.addTimelineEvent('TRANSMISSION GATE', 'Verifying context through Hard TransmissionGate before transmission');

    const networkStart = performance.now();
    let actionResponse: ActionResponse;
    try {
      actionResponse = await this.remoteClient.plan(sanitizedContext, this.state.task, this.stepHistory);
    } catch (netErr: any) {
      this.updateState({
        agentState: 'NETWORK_BLOCKED',
        privacyStatus: 'BLOCKED',
        networkStatus: 'BLOCKED',
      });
      const guidance = `⚠️ Hard Transmission Gate Blocked: ${netErr.message || 'Security boundary violation'} — 0 bytes transmitted.`;
      this.addTimelineEvent('TRANSMISSION GATE BLOCKED', guidance);
      this.postSystemEvent(
        'request_blocked',
        'HARD TRANSMISSION GATE BLOCKED',
        guidance,
        'error'
      );

      if (this.targetTabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        try {
          chrome.tabs.sendMessage(this.targetTabId, {
            type: 'PRIVACY_GATE_BLOCKED',
            payload: {
              message: guidance,
              reason: netErr.message,
              step: this.currentStep,
            },
          }, () => {});
        } catch {}
      }

      this.isRunning = false;
      return;
    }
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

      // Record failed validation in history
      this.stepHistory.push({
        stepIndex: this.currentStep,
        action: actionResponse.action,
        success: false,
        error: `Validation failed: ${err.message}`,
        pageUrl: pageUrl,
        timestamp: Date.now(),
      });

      throw new Error(`Action validation failed: ${err.message}`);
    }
    const valMs = performance.now() - valStart;

    // 7. RISK CLASSIFICATION & CONFIRMATION
    const riskLevel = classifyActionRisk(actionResponse.action, sanitizedContext.dom.elements);
    if (riskLevel === 'high') {
      const confirmation = buildConfirmationRequest(
        actionResponse.action, riskLevel, sanitizedContext.dom.elements
      );
      this.updateState({
        agentState: 'WAITING_CONFIRMATION',
        pendingConfirmation: confirmation,
      });
      this.addTimelineEvent('CONFIRMATION REQUIRED', confirmation.description);

      // Wait for user to confirm or deny
      const confirmed = await new Promise<boolean>((resolve) => {
        this.pendingConfirmationResolve = resolve;
        // Auto-deny after 60 seconds if no response
        setTimeout(() => {
          if (this.pendingConfirmationResolve === resolve) {
            this.pendingConfirmationResolve = null;
            resolve(false);
          }
        }, 60000);
      });

      this.updateState({ pendingConfirmation: undefined });

      if (!confirmed) {
        this.addTimelineEvent('ACTION DENIED', 'User denied high-risk action');
        this.stepHistory.push({
          stepIndex: this.currentStep,
          action: actionResponse.action,
          success: false,
          error: 'Denied by user',
          pageUrl: pageUrl,
          timestamp: Date.now(),
        });
        return; // Skip execution, continue to next step
      }
      this.addTimelineEvent('ACTION CONFIRMED', 'User approved high-risk action');
    }

    // Handle read_page / finish actions (no browser execution needed)
    if (actionResponse.action.action === 'read_page' || actionResponse.action.action === 'finish') {
      this.updateState({ agentState: 'COMPLETED' });
      this.addTimelineEvent('AI ANSWER', actionResponse.reasoning || 'I observed the page and it matches your request.');
      this.addTimelineEvent('TASK COMPLETED', 'Task completed');
      this.postSystemEvent('task_completed', 'Task Completed', `${actionResponse.action.action} reached`);

      this.stepHistory.push({
        stepIndex: this.currentStep,
        action: actionResponse.action,
        success: true,
        pageUrl: pageUrl,
        observation: actionResponse.reasoning,
        timestamp: Date.now(),
      });
      return;
    }

    // Handle ask_user action
    if (actionResponse.action.action === 'ask_user') {
      this.addTimelineEvent('QUESTION', actionResponse.action.question || actionResponse.reasoning || 'The agent needs your input.');
      this.updateState({ agentState: 'COMPLETED' });
      this.stepHistory.push({
        stepIndex: this.currentStep,
        action: actionResponse.action,
        success: true,
        pageUrl: pageUrl,
        observation: actionResponse.action.question,
        timestamp: Date.now(),
      });
      return;
    }

    // 8. BROWSER ACTION EXECUTION
    // Capture page state before action for validation
    const beforePageState = perception.pageState;

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
        : actionResponse.action.action === 'navigate'
        ? `Navigating to ${actionResponse.action.url || ''}`
        : actionResponse.action.action === 'select'
        ? `Selecting "${actionResponse.action.value}" in ${actionResponse.action.target}`
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

    // 9. POST-ACTION VALIDATION
    this.updateState({ agentState: 'VALIDATING' });
    let afterPageState: PageState | undefined;
    try {
      const afterPerception = await this.getPerceptionFromTab();
      afterPageState = afterPerception.pageState;
    } catch {
      // Re-observation may fail if page navigated
    }

    const validation = validateActionResult(
      actionResponse.action,
      beforePageState,
      afterPageState,
      execError,
    );

    // Record step in history
    this.stepHistory.push({
      stepIndex: this.currentStep,
      action: actionResponse.action,
      success: validation.success,
      error: validation.error,
      pageUrl: afterPageState?.url || pageUrl,
      observation: validation.observation,
      timestamp: Date.now(),
    });

    this.updateState({
      stepHistory: this.stepHistory,
      currentStep: this.currentStep,
    });

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
    await this.remoteClient.sendExecuteResult({
      action: actionResponse.action,
      success: execSuccess,
      error: execError,
      metrics,
    });
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
}

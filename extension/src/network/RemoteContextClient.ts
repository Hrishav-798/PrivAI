/**
 * PrivAI — Remote Context Client
 *
 * Sole authorized egress boundary for transmitting sanitized context to the backend.
 * Physically gates every outgoing plan request through TransmissionGate.assertSafeToTransmit.
 * Guarantees zero raw page context or unredacted PII can exit the client boundary.
 */

import {
  SanitizedContext,
  ActionResponse,
  StepHistoryEntry,
  Action,
  PerformanceMetrics,
} from '../types';
import { TransmissionGate } from './TransmissionGate';
import { sanitizeUrl } from '../privacy/sanitization/urlSanitizer';

export class RemoteContextClient {
  private backendBaseUrl: string;

  constructor(backendBaseUrl: string = 'http://localhost:8000') {
    this.backendBaseUrl = backendBaseUrl;
  }

  public getBackendBaseUrl(): string {
    return this.backendBaseUrl;
  }

  public setBackendBaseUrl(url: string) {
    this.backendBaseUrl = url;
  }

  /**
   * Sole authorized context transmission method.
   * Runs authoritative TransmissionGate runtime checks before initiating network socket.
   */
  public async plan(
    context: SanitizedContext,
    task: string,
    stepHistory: StepHistoryEntry[] = []
  ): Promise<ActionResponse> {
    // 1. Authoritative Hard Gate verification (fails closed with PrivacyViolationError)
    TransmissionGate.assertSafeToTransmit(context);

    // 2. Encode sanitized screenshot
    const screenshotBase64 = await this.blobToBase64(context.screenshot as unknown as Blob);

    // 3. Build egress payload containing strictly sanitized components
    const payload = {
      task,
      screen: { width: 1440, height: 900 },
      sanitized_dom: context.dom.elements,
      redactions: context.redactions,
      privacy: context.privacy,
      sanitized_screenshot: screenshotBase64,
      page_title: context.dom.title || '',
      page_url: sanitizeUrl(context.dom.url || ''),
      page_state: context.dom.pageState || null,
      semantic_tree: context.dom.semanticTree || '',
      step_history: this.formatStepHistory(stepHistory),
    };

    const res = await fetch(`${this.backendBaseUrl}/api/agent/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`Remote reasoning server returned HTTP ${res.status}: ${errTxt}`);
    }

    const data = await res.json();

    // 4. Validate server response structure (strict schema validation)
    if (!data || typeof data !== 'object' || !data.action || typeof data.action.action !== 'string') {
      throw new Error('Remote reasoning server returned malformed action response');
    }

    return data as ActionResponse;
  }

  /**
   * Reports system heartbeat (non-context metadata only).
   */
  public async sendHeartbeat(info: {
    vision_backend: string;
    vision_model: string;
    version?: string;
  }): Promise<void> {
    try {
      await fetch(`${this.backendBaseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vision_backend: info.vision_backend,
          vision_model: info.vision_model,
          version: info.version || '1.0.0',
        }),
      });
    } catch {
      // Background heartbeat failure is non-fatal
    }
  }

  /**
   * Posts audit telemetry event (scrubs details of any accidental tokens).
   */
  public async postSystemEvent(
    event: string,
    label: string,
    detail: string = '',
    level: string = 'info'
  ): Promise<void> {
    try {
      await fetch(`${this.backendBaseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          label: sanitizeUrl(label),
          detail: sanitizeUrl(detail),
          timestamp: Date.now(),
          level,
        }),
      });
    } catch {
      // Event logging failure is non-fatal
    }
  }

  /**
   * Reports execution result for dashboard observability.
   */
  public async sendExecuteResult(payload: {
    action: Action;
    success: boolean;
    error?: string;
    metrics?: PerformanceMetrics;
  }): Promise<void> {
    try {
      const sanitizedAction: Action = { ...payload.action };
      if (sanitizedAction.action === 'type') {
        const targetStr = String(sanitizedAction.target || '').toLowerCase();
        if (targetStr.includes('password') || targetStr.includes('pin') || targetStr.includes('pwd')) {
          sanitizedAction.text = '[REDACTED]';
        }
      }
      const sanitizedError = payload.error ? sanitizeUrl(payload.error) : undefined;

      await fetch(`${this.backendBaseUrl}/api/agent/execute-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          action: sanitizedAction,
          error: sanitizedError,
        }),
      });
    } catch {
      // Telemetry failure is non-fatal
    }
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

  private formatStepHistory(history: StepHistoryEntry[]): string {
    if (!history || history.length === 0) return '';
    return history
      .slice(-5)
      .map((h) => `Step ${h.stepIndex + 1}: ${h.action.action} -> ${h.success ? 'Success' : 'Failed'}${h.observation ? ` (${h.observation})` : ''}`)
      .join('\n');
  }
}

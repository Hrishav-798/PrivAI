import { ILocalVisionModel } from './LocalVisionModel';
import { VisionDetection, LocalVisionBackend } from './VisionTypes';

export class LocalVisionClient implements ILocalVisionModel {
  private ready: boolean = false;
  private backend: LocalVisionBackend = 'none';
  private modelName: string = 'UltraFace Slim (320x240)';
  private lastInferenceTime: number = 0;
  private offscreenReady: Promise<void> | null = null;

  async initialize(): Promise<void> {
    try {
      await this.ensureOffscreenDocument();

      // Retry up to 5 times in case the offscreen document is still parsing its bundle
      let res: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        res = await this.sendMessageToOffscreen({
          target: 'offscreen-vision',
          type: 'INIT_VISION',
        });
        if (res && res.success !== undefined) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      if (res && res.success) {
        this.ready = true;
        this.backend = res.backend || 'wasm';
        this.modelName = res.modelName || this.modelName;
      } else {
        console.warn('[PrivAI] Offscreen vision initialization returned failure:', res?.error);
        this.ready = false;
        this.backend = res?.backend || 'none';
      }
    } catch (err) {
      console.warn('[PrivAI] Could not initialize offscreen vision:', err);
      this.ready = false;
      this.backend = 'none';
    }
  }

  async detect(imageBlob: Blob, origWidth: number, origHeight: number): Promise<VisionDetection[]> {
    if (!this.ready) {
      return [];
    }

    try {
      const buffer = await imageBlob.arrayBuffer();
      const res = await this.sendMessageToOffscreen({
        target: 'offscreen-vision',
        type: 'DETECT_VISION',
        buffer,
        origWidth,
        origHeight,
      });

      if (res && res.success) {
        this.lastInferenceTime = res.inferenceMs || 0;
        return res.detections || [];
      }
      return [];
    } catch (err) {
      console.error('[PrivAI] Vision detection error via offscreen:', err);
      return [];
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  getBackend(): LocalVisionBackend {
    return this.backend;
  }

  getModelName(): string {
    return this.modelName;
  }

  getLastInferenceTime(): number {
    return this.lastInferenceTime;
  }

  private async ensureOffscreenDocument(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.offscreen) {
      throw new Error('chrome.offscreen API not available in current environment');
    }

    if (await chrome.offscreen.hasDocument()) {
      return;
    }

    if (!this.offscreenReady) {
      this.offscreenReady = chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
        justification: 'Run ONNX Runtime Web local vision inference for privacy redaction',
      });
    }

    await this.offscreenReady;
    this.offscreenReady = null;
  }

  private sendMessageToOffscreen(message: any): Promise<any> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    });
  }
}

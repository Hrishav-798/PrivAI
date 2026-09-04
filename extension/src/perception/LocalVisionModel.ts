import { VisionDetection, LocalVisionBackend } from './VisionTypes';
import { calculateIoU, Rect } from './geometry';
import * as ort from 'onnxruntime-web';

export interface PriorBox {
  centerX: number;
  centerY: number;
  w: number;
  h: number;
}

export interface ILocalVisionModel {
  initialize(): Promise<void>;
  detect(imageBlob: Blob, origWidth: number, origHeight: number): Promise<VisionDetection[]>;
  isReady(): boolean;
  getBackend(): LocalVisionBackend;
  getModelName(): string;
  getLastInferenceTime(): number;
  getPriorsCount(): number;
}

const MODEL_INPUT_WIDTH = 320;
const MODEL_INPUT_HEIGHT = 240;
const STRIDES = [8, 16, 32, 64];
const MIN_BOXES = [
  [10, 16, 24],
  [32, 48],
  [64, 96],
  [128, 192, 256],
];

export const CONFIDENCE_THRESHOLD = 0.7;
export const NMS_IOU_THRESHOLD = 0.3;
export const CENTER_VARIANCE = 0.1;
export const SIZE_VARIANCE = 0.2;

/**
 * Precomputes multi-scale prior/anchor boxes for UltraFace (version-slim-320).
 * Yields exactly 4420 prior boxes matching the ONNX model output dimension.
 */
export function generateUltraFacePriors(): PriorBox[] {
  const priors: PriorBox[] = [];

  for (let k = 0; k < STRIDES.length; k++) {
    const stride = STRIDES[k];
    const minBoxSizes = MIN_BOXES[k];
    const featureW = Math.ceil(MODEL_INPUT_WIDTH / stride);
    const featureH = Math.ceil(MODEL_INPUT_HEIGHT / stride);

    for (let i = 0; i < featureH; i++) {
      for (let j = 0; j < featureW; j++) {
        for (const minBoxSize of minBoxSizes) {
          const centerX = ((j + 0.5) * stride) / MODEL_INPUT_WIDTH;
          const centerY = ((i + 0.5) * stride) / MODEL_INPUT_HEIGHT;
          const w = minBoxSize / MODEL_INPUT_WIDTH;
          const h = minBoxSize / MODEL_INPUT_HEIGHT;
          priors.push({ centerX, centerY, w, h });
        }
      }
    }
  }

  return priors;
}

const ULTRAFACE_PRIORS: PriorBox[] = generateUltraFacePriors();

interface CandidateDetection {
  score: number;
  bbox: Rect;
}

function decodeBox(
  prior: PriorBox,
  loc0: number,
  loc1: number,
  loc2: number,
  loc3: number,
  origWidth: number,
  origHeight: number
): Rect {
  const decodedCenterX = prior.centerX + loc0 * CENTER_VARIANCE * prior.w;
  const decodedCenterY = prior.centerY + loc1 * CENTER_VARIANCE * prior.h;
  const decodedW = prior.w * Math.exp(loc2 * SIZE_VARIANCE);
  const decodedH = prior.h * Math.exp(loc3 * SIZE_VARIANCE);

  const xmin = Math.max(0, Math.min(1, decodedCenterX - decodedW / 2));
  const ymin = Math.max(0, Math.min(1, decodedCenterY - decodedH / 2));
  const xmax = Math.max(0, Math.min(1, decodedCenterX + decodedW / 2));
  const ymax = Math.max(0, Math.min(1, decodedCenterY + decodedH / 2));

  return {
    x: xmin * origWidth,
    y: ymin * origHeight,
    width: (xmax - xmin) * origWidth,
    height: (ymax - ymin) * origHeight,
  };
}

export function nonMaxSuppression(candidates: CandidateDetection[], iouThreshold: number): CandidateDetection[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: CandidateDetection[] = [];

  for (const candidate of sorted) {
    let keep = true;
    for (const existing of selected) {
      if (calculateIoU(candidate.bbox, existing.bbox) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) {
      selected.push(candidate);
    }
  }

  return selected;
}

export class LocalVisionModel implements ILocalVisionModel {
  private ready: boolean = false;
  private backend: LocalVisionBackend = 'none';
  private session: ort.InferenceSession | null = null;
  private lastInferenceTime: number = 0;
  private readonly modelName = 'UltraFace Slim (320x240)';

  static generatePriors(): PriorBox[] {
    return generateUltraFacePriors();
  }

  getPriorsCount(): number {
    return ULTRAFACE_PRIORS.length;
  }

  async initialize(): Promise<void> {
    if (ort.env) {
      ort.env.logLevel = 'error';
      if (ort.env.wasm) {
        ort.env.wasm.wasmPaths = chrome?.runtime?.getURL ? chrome.runtime.getURL('wasm/') : '';
        ort.env.wasm.numThreads = 1;
      }
    }

    const modelPath = chrome?.runtime?.getURL ? chrome.runtime.getURL('models/ultraface.onnx') : 'models/ultraface.onnx';

    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgpu'],
        logSeverityLevel: 3,
      });
      this.backend = 'webgpu';
    } catch (e) {
      console.warn('WebGPU not available, falling back to WASM', e);
      try {
        this.session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['wasm'],
          logSeverityLevel: 3,
        });
        this.backend = 'wasm';
      } catch (e2) {
        console.error('WASM fallback failed', e2);
        this.backend = 'none';
        return;
      }
    }

    this.ready = true;
  }

  async detect(imageBlob: Blob, origWidth: number, origHeight: number): Promise<VisionDetection[]> {
    if (!this.ready || !this.session) throw new Error('Model not ready');

    const start = performance.now();
    const inputTensor = await this.preprocess(imageBlob);

    const feeds: Record<string, ort.Tensor> = {};
    feeds[this.session.inputNames[0]] = inputTensor;

    const results = await this.session.run(feeds);

    const detections = this.postprocess(results, origWidth, origHeight);
    this.lastInferenceTime = performance.now() - start;

    return detections;
  }

  private async preprocess(blob: Blob): Promise<ort.Tensor> {
    const targetWidth = MODEL_INPUT_WIDTH;
    const targetHeight = MODEL_INPUT_HEIGHT;

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    const imageBitmap = await createImageBitmap(blob);
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    const resizedData = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const floatData = new Float32Array(3 * targetWidth * targetHeight);

    // NCHW format: (pixel - 127.0) / 128.0
    for (let i = 0; i < targetWidth * targetHeight; i++) {
      floatData[i] = (resizedData[i * 4] - 127.0) / 128.0;
      floatData[targetWidth * targetHeight + i] = (resizedData[i * 4 + 1] - 127.0) / 128.0;
      floatData[2 * targetWidth * targetHeight + i] = (resizedData[i * 4 + 2] - 127.0) / 128.0;
    }

    return new ort.Tensor('float32', floatData, [1, 3, targetHeight, targetWidth]);
  }

  private postprocess(results: ort.InferenceSession.ReturnType, origWidth: number, origHeight: number): VisionDetection[] {
    const outNames = Object.keys(results);
    if (outNames.length < 2) {
      return [];
    }

    let scoresData = results[outNames[0]].data as Float32Array;
    let boxesData = results[outNames[1]].data as Float32Array;

    // Swap if names were returned in boxes, scores order
    if (scoresData.length === 4420 * 4 && boxesData.length === 4420 * 2) {
      const temp = scoresData;
      scoresData = boxesData;
      boxesData = temp;
    }

    if (scoresData.length < 4420 * 2 || boxesData.length < 4420 * 4) {
      return [];
    }

    const candidates: CandidateDetection[] = [];
    for (let i = 0; i < ULTRAFACE_PRIORS.length; i++) {
      const faceScore = scoresData[i * 2 + 1];
      if (faceScore > CONFIDENCE_THRESHOLD) {
        const loc0 = boxesData[i * 4];
        const loc1 = boxesData[i * 4 + 1];
        const loc2 = boxesData[i * 4 + 2];
        const loc3 = boxesData[i * 4 + 3];

        const bbox = decodeBox(
          ULTRAFACE_PRIORS[i],
          loc0,
          loc1,
          loc2,
          loc3,
          origWidth,
          origHeight
        );

        candidates.push({ score: faceScore, bbox });
      }
    }

    const suppressed = nonMaxSuppression(candidates, NMS_IOU_THRESHOLD);

    return suppressed.map((cand, idx) => ({
      id: `vision-face-${idx}`,
      className: 'face',
      confidence: cand.score,
      bbox: cand.bbox,
      source: 'local-vision',
    }));
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
}

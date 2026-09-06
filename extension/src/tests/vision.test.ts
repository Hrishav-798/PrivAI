import { LocalVisionModel } from '../perception/LocalVisionModel';
import { mergeDetections } from '../perception/detectionMerger';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { DOMElement, RawContext } from '../types';
import * as ort from 'onnxruntime-web';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../privacy/redaction', () => ({
  redactScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
}));

// Mock ONNX Runtime Web since we can't load real GPU in Node/Vitest natively
vi.mock('onnxruntime-web', () => {
  return {
    env: { wasm: { wasmPaths: '' } },
    InferenceSession: {
      create: vi.fn().mockImplementation((path, options) => {
        if (path.includes('invalid')) {
          return Promise.reject(new Error("Invalid model"));
        }
        if (options.executionProviders.includes('webgpu') && (global as any).__mockNoWebGPU) {
          return Promise.reject(new Error("WebGPU unavailable"));
        }
        return Promise.resolve({
          inputNames: ['input'],
          run: vi.fn().mockImplementation(() => {
            if ((global as any).__mockRunOutputs) {
              return Promise.resolve((global as any).__mockRunOutputs);
            }
            return Promise.resolve({
              scores: { data: new Float32Array(4420 * 2).fill(0.01).map((v, i) => (i === 1 ? 0.95 : v)) }, // High confidence at index 0 (face score at index 1)
              boxes: { data: new Float32Array(4420 * 4).fill(0.0) } // Delta 0
            });
          })
        });
      })
    },
    Tensor: vi.fn().mockImplementation((type, data, dims) => ({ type, data, dims }))
  };
});

describe('Local Vision Pipeline Integration Tests', () => {
  let originalFetch: typeof global.fetch;
  
  beforeAll(() => {
    // 12. Network Isolation Test Setup
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && !url.startsWith('chrome-extension://') && !url.startsWith('data:')) {
        throw new Error(`Network isolation violation: Attempted to fetch external URL ${url}`);
      }
      return Promise.resolve({
        blob: () => Promise.resolve(new Blob()),
      } as unknown as Response); // Mock successful local fetch — avoids jsdom Response(Blob) incompatibility
    });
    
    // Mock navigator and chrome
    (global as any).chrome = { runtime: { getURL: (p: string) => `chrome-extension://mock/${p}` } };
    (global as any).navigator = { gpu: { requestAdapter: vi.fn().mockResolvedValue({}) } };
    (global as any).createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600 });
    (global as any).OffscreenCanvas = class {
      getContext() { return { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(320*240*4) }) }; }
    };
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('Model Initialization & Backend Selection', () => {
    it('1, 2, 3: Initializes model with WebGPU backend when available', async () => {
      (global as any).__mockNoWebGPU = false;
      const vision = new LocalVisionModel();
      await vision.initialize();
      expect(vision.isReady()).toBe(true);
      expect(vision.getBackend()).toBe('webgpu');
    });

    it('4: Gracefully falls back to WASM when WebGPU fails', async () => {
      (global as any).__mockNoWebGPU = true;
      const vision = new LocalVisionModel();
      await vision.initialize();
      expect(vision.isReady()).toBe(true);
      expect(vision.getBackend()).toBe('wasm');
    });

    it('11: Handles model loading failures without crashing', async () => {
      const vision = new LocalVisionModel();
      const originalGetURL = (global as any).chrome.runtime.getURL;
      try {
        (global as any).chrome.runtime.getURL = () => 'invalid-model.onnx';
        await vision.initialize();
        expect(vision.isReady()).toBe(false);
        expect(vision.getBackend()).toBe('none');
      } finally {
        (global as any).chrome.runtime.getURL = originalGetURL;
      }
    });
  });

  describe('Inference Result Structure & Detections', () => {
    let vision: LocalVisionModel;

    beforeEach(async () => {
      (global as any).__mockNoWebGPU = false;
      vision = new LocalVisionModel();
      await vision.initialize();
    });

    it('5, 6, 7, 9: Extracts valid detections, bbox, and confidence', async () => {
      const blob = new Blob();
      const detections = await vision.detect(blob, 800, 600);
      
      expect(detections.length).toBeGreaterThan(0);
      const face = detections[0];
      
      expect(face.className).toBe('face');
      expect(face.confidence).toBeCloseTo(0.95);
      expect(face.source).toBe('local-vision');
      
      // BBox coordinates must be mapped back to screenshot dims
      expect(face.bbox.x).toBeGreaterThanOrEqual(0);
      expect(face.bbox.width).toBeGreaterThanOrEqual(0);
    });

    it('produces exactly 4420 multi-scale SSD prior boxes', () => {
      expect(vision.getPriorsCount()).toBe(4420);
      expect(LocalVisionModel.generatePriors().length).toBe(4420);
    });

    it('decodes bounding boxes to accurate quadrants instead of fixed coordinates', async () => {
      const origWidth = 800;
      const origHeight = 600;

      // 1. Activate an anchor in the top-left (Anchor 0)
      const scoresTopLeft = new Float32Array(4420 * 2).fill(0.01);
      scoresTopLeft[0 * 2 + 1] = 0.95; // Face score for anchor 0
      const boxesTopLeft = new Float32Array(4420 * 4).fill(0.0);

      (global as any).__mockRunOutputs = {
        scores: { data: scoresTopLeft },
        boxes: { data: boxesTopLeft },
      };

      const detectionsTopLeft = await vision.detect(new Blob(), origWidth, origHeight);
      expect(detectionsTopLeft.length).toBe(1);
      const boxTL = detectionsTopLeft[0].bbox;
      const centerTLX = boxTL.x + boxTL.width / 2;
      const centerTLY = boxTL.y + boxTL.height / 2;

      // Top-left quadrant: center within first 25% of width and height
      expect(centerTLX).toBeLessThan(origWidth * 0.25);
      expect(centerTLY).toBeLessThan(origHeight * 0.25);

      // 2. Activate an anchor in the bottom-right (Anchor 3597: Stride 8 cell row 29, col 39)
      const scoresBottomRight = new Float32Array(4420 * 2).fill(0.01);
      scoresBottomRight[3597 * 2 + 1] = 0.95; // Face score for anchor 3597
      const boxesBottomRight = new Float32Array(4420 * 4).fill(0.0);

      (global as any).__mockRunOutputs = {
        scores: { data: scoresBottomRight },
        boxes: { data: boxesBottomRight },
      };

      const detectionsBottomRight = await vision.detect(new Blob(), origWidth, origHeight);
      expect(detectionsBottomRight.length).toBe(1);
      const boxBR = detectionsBottomRight[0].bbox;
      const centerBRX = boxBR.x + boxBR.width / 2;
      const centerBRY = boxBR.y + boxBR.height / 2;

      // Bottom-right quadrant: center beyond 75% of width and height
      expect(centerBRX).toBeGreaterThan(origWidth * 0.75);
      expect(centerBRY).toBeGreaterThan(origHeight * 0.75);

      // Assert that the two bounding boxes are clearly distinct and not hardcoded
      expect(boxTL.x).not.toBe(boxBR.x);
      expect(boxTL.y).not.toBe(boxBR.y);

      delete (global as any).__mockRunOutputs;
    });

    it('collapses multiple overlapping anchors near the same face into one box via NMS', async () => {
      const origWidth = 800;
      const origHeight = 600;

      // Activate both Anchor 0 and Anchor 1 at the same feature cell (0, 0)
      const scores = new Float32Array(4420 * 2).fill(0.01);
      scores[0 * 2 + 1] = 0.95; // Face score for anchor 0
      scores[1 * 2 + 1] = 0.88; // Face score for anchor 1 (overlapping)
      const boxes = new Float32Array(4420 * 4).fill(0.0);

      (global as any).__mockRunOutputs = {
        scores: { data: scores },
        boxes: { data: boxes },
      };

      const detections = await vision.detect(new Blob(), origWidth, origHeight);
      // Because Anchor 0 and Anchor 1 overlap significantly, NMS must collapse them to 1
      expect(detections.length).toBe(1);
      expect(detections[0].confidence).toBeCloseTo(0.95);

      delete (global as any).__mockRunOutputs;
    });

    it('retains multiple distinct non-overlapping faces after NMS', async () => {
      const origWidth = 800;
      const origHeight = 600;

      // Activate both Anchor 0 (top-left) and Anchor 3597 (bottom-right)
      const scores = new Float32Array(4420 * 2).fill(0.01);
      scores[0 * 2 + 1] = 0.92;
      scores[3597 * 2 + 1] = 0.89;
      const boxes = new Float32Array(4420 * 4).fill(0.0);

      (global as any).__mockRunOutputs = {
        scores: { data: scores },
        boxes: { data: boxes },
      };

      const detections = await vision.detect(new Blob(), origWidth, origHeight);
      // Both should survive because IoU == 0
      expect(detections.length).toBe(2);

      delete (global as any).__mockRunOutputs;
    });
  });

  describe('Detection Merging', () => {
    it('8: Merges DOM detections and vision detections via IoU', () => {
      const domElements: DOMElement[] = [
        { element_id: 'btn', tag: 'button', role: 'button', text: 'Submit', bbox: { x: 10, y: 10, width: 100, height: 50 }, visible: true, enabled: true, interactive: true, label: '', focused: false }
      ];
      
      const visionDetections = [
        { id: 'v-1', className: 'face', confidence: 0.9, bbox: { x: 200, y: 200, width: 50, height: 50 }, source: 'local-vision' as const },
        { id: 'v-2', className: 'button', confidence: 0.8, bbox: { x: 12, y: 12, width: 95, height: 45 }, source: 'local-vision' as const }
      ];

      const merged = mergeDetections(domElements, visionDetections);
      
      // Should match dom btn and vision btn (v-2)
      const domMatch = merged.find(m => m.domId === 'btn');
      expect(domMatch.source).toBe('merged');
      expect(domMatch.className).toBe('button');
      
      // Should keep unmapped face
      const faceMatch = merged.find(m => m.className === 'face');
      expect(faceMatch.source).toBe('vision');
    });
  });

  describe('Privacy Engine Integration', () => {
    it('10: Accepts vision regions and locally redacts them', async () => {
      const privacy = new PrivacyEngine();
      
      const rawContext: RawContext = {
        __brand: 'RawContext',
        screenshot: new Blob() as any,
        dom: { __brand: 'RawDOM', elements: [], title: '', url: '', timestamp: 0 }
      };

      const visionRegions = [
        { id: 'v-face', type: 'face' as const, confidence: 0.95, bbox: { x: 0, y: 0, width: 100, height: 100 }, source: 'vision' as const, redaction: 'blur' as const }
      ];

      const sanitized = await privacy.process(rawContext, visionRegions);
      
      expect(sanitized.redactions.length).toBe(1);
      expect(sanitized.redactions[0].type).toBe('face');
      expect(sanitized.redactions[0].treatment).toBe('blur');
    });
  });
});

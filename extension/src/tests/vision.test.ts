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
          run: vi.fn().mockResolvedValue({
            scores: { data: new Float32Array(4420 * 2).fill(0.1).map((v, i) => i === 1 ? 0.95 : v) }, // High confidence at index 0
            boxes: { data: new Float32Array(4420 * 4).fill(0.1) } // Dummy box
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
      return Promise.resolve(new Response(new Blob())); // Mock successful local fetch
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
      
      // BBox coordinates must be mapped back to screenshot dims (simulated mapping logic in postprocess)
      expect(face.bbox.x).toBeGreaterThanOrEqual(0);
      expect(face.bbox.width).toBeGreaterThanOrEqual(0);
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

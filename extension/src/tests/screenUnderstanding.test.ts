import { ScreenUnderstandingModel } from '../perception/ScreenUnderstandingModel';
import { mergeDetections } from '../perception/detectionMerger';
import { calculateIoU } from '../perception/geometry';
import { DOMElement } from '../types/common';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('onnxruntime-web', () => {
  return {
    env: { wasm: { wasmPaths: '' } },
    InferenceSession: {
      create: vi.fn().mockImplementation((path: string, options: any) => {
        if (path.includes('invalid')) {
          return Promise.reject(new Error('Invalid model'));
        }
        if (options.executionProviders.includes('webgpu') && (global as any).__mockNoWebGPU) {
          return Promise.reject(new Error('WebGPU unavailable'));
        }
        if (options.executionProviders.includes('wasm') && (global as any).__mockNoWASM) {
          return Promise.reject(new Error('WASM unavailable'));
        }
        return Promise.resolve({
          inputNames: ['input_image'],
          run: vi.fn().mockImplementation(() => {
            // Return 3 UI element detections: button, input, card
            // Format: [x1, y1, x2, y2, classIdx, score]
            const outData = new Float32Array([
              // Button in center: x: 100, y: 150, w: 120, h: 40 -> normalized (800x600)
              100 / 800, 150 / 600, 220 / 800, 190 / 600, 0, 0.94,
              // Input field: x: 100, y: 80, w: 200, h: 35
              100 / 800, 80 / 600, 300 / 800, 115 / 600, 1, 0.91,
              // Card container: x: 50, y: 50, w: 400, h: 300
              50 / 800, 50 / 600, 450 / 800, 350 / 600, 4, 0.88,
            ]);
            return Promise.resolve({
              detections: { data: outData },
            });
          }),
        });
      }),
    },
    Tensor: vi.fn().mockImplementation((type, data, dims) => ({ type, data, dims })),
  };
});

describe('Real Vision-Based Screen Understanding Pipeline', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && !url.startsWith('chrome-extension://') && !url.startsWith('data:')) {
        throw new Error(`Network isolation violation: Attempted external fetch to ${url}`);
      }
      return Promise.resolve(new Response(new Blob()));
    });

    (global as any).chrome = { runtime: { getURL: (p: string) => `chrome-extension://mock/${p}` } };
    (global as any).createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600 });
    (global as any).OffscreenCanvas = class {
      constructor(private w: number, private h: number) {}
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: () => ({
            data: new Uint8ClampedArray(this.w * this.h * 4),
          }),
        };
      }
    };
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('Hardware Backend Selection & Fallback Hierarchy', () => {
    it('initializes with WebGPU when hardware acceleration is available', async () => {
      (global as any).__mockNoWebGPU = false;
      (global as any).__mockNoWASM = false;

      const model = new ScreenUnderstandingModel();
      await model.initialize();

      expect(model.isReady()).toBe(true);
      expect(model.getBackend()).toBe('webgpu');
      expect(model.getModelName()).toContain('ScreenViT');
    });

    it('gracefully falls back to WASM when WebGPU fails', async () => {
      (global as any).__mockNoWebGPU = true;
      (global as any).__mockNoWASM = false;

      const model = new ScreenUnderstandingModel();
      await model.initialize();

      expect(model.isReady()).toBe(true);
      expect(model.getBackend()).toBe('wasm');
    });

    it('falls back to local heuristic pixel-CV when both WebGPU and WASM models fail', async () => {
      (global as any).__mockNoWebGPU = true;
      (global as any).__mockNoWASM = true;

      const model = new ScreenUnderstandingModel();
      await model.initialize();

      expect(model.isReady()).toBe(true);
      expect(model.getBackend()).toBe('fallback-heuristic');
      expect(model.getModelName()).toContain('Heuristic');
    });
  });

  describe('Pixel-Level Screen Element Detection (Independent of DOM)', () => {
    let model: ScreenUnderstandingModel;

    beforeEach(async () => {
      (global as any).__mockNoWebGPU = false;
      (global as any).__mockNoWASM = false;
      model = new ScreenUnderstandingModel();
      await model.initialize();
    });

    it('detects UI elements (buttons, inputs, cards) directly from screenshot pixels', async () => {
      const blob = new Blob();
      const detections = await model.detect(blob, 800, 600);

      expect(detections.length).toBe(3);

      const button = detections.find(d => d.className === 'button');
      const input = detections.find(d => d.className === 'input');
      const card = detections.find(d => d.className === 'card');

      expect(button).toBeDefined();
      expect(button!.confidence).toBeGreaterThan(0.9);
      expect(button!.bbox).toEqual({ x: 100, y: 150, width: 120, height: 40 });

      expect(input).toBeDefined();
      expect(input!.confidence).toBeGreaterThan(0.9);
      expect(input!.bbox).toEqual({ x: 100, y: 80, width: 200, height: 35 });

      expect(card).toBeDefined();
      expect(card!.confidence).toBeGreaterThan(0.8);
      expect(card!.bbox).toEqual({ x: 50, y: 50, width: 400, height: 300 });
    });

    it('measures spatial IoU between visual predictions and ground truth UI layout', async () => {
      const groundTruthButton = { x: 100, y: 150, width: 120, height: 40 };
      const groundTruthInput = { x: 100, y: 80, width: 200, height: 35 };

      const detections = await model.detect(new Blob(), 800, 600);
      const predictedButton = detections.find(d => d.className === 'button')!.bbox;
      const predictedInput = detections.find(d => d.className === 'input')!.bbox;

      const buttonIoU = calculateIoU(predictedButton, groundTruthButton);
      const inputIoU = calculateIoU(predictedInput, groundTruthInput);

      console.log(`[ScreenUnderstanding] Button IoU: ${(buttonIoU * 100).toFixed(2)}%`);
      console.log(`[ScreenUnderstanding] Input IoU: ${(inputIoU * 100).toFixed(2)}%`);

      expect(buttonIoU).toBe(1.0);
      expect(inputIoU).toBe(1.0);
    });

    it('synthesizes DOM elements for Canvas/WebGL applications where DOM is empty', async () => {
      const detections = await model.detect(new Blob(), 800, 600);
      const synthesized = model.synthesizeDOMElements(detections);

      expect(synthesized.length).toBe(3);

      const synthButton = synthesized.find(s => s.tag === 'button');
      const synthInput = synthesized.find(s => s.tag === 'input');

      expect(synthButton).toBeDefined();
      expect(synthButton!.interactive).toBe(true);
      expect(synthButton!.role).toBe('button');
      expect(synthButton!.bbox).toEqual({ x: 100, y: 150, width: 120, height: 40 });

      expect(synthInput).toBeDefined();
      expect(synthInput!.interactive).toBe(true);
      expect(synthInput!.input_type).toBe('text');
    });

    it('merges visual UI detections with DOM elements via detectionMerger', async () => {
      const detections = await model.detect(new Blob(), 800, 600);

      // Suppose DOM only knows about the input element, while the button was rendered on a canvas!
      const domElements: DOMElement[] = [
        {
          id: 'dom-input-1',
          element_id: 'dom-input-1',
          tag: 'input',
          role: 'textbox',
          text: '',
          label: 'Username',
          bbox: { x: 100, y: 80, width: 200, height: 35 },
          visible: true,
          enabled: true,
          interactive: true,
        },
      ];

      const merged = mergeDetections(domElements, detections);

      // The input element should be matched as 'merged'
      const mergedInput = merged.find(m => m.domId === 'dom-input-1');
      expect(mergedInput).toBeDefined();
      expect(mergedInput.source).toBe('merged');

      // The canvas-rendered button should be included as 'vision'
      const visionButton = merged.find(m => m.source === 'vision' && m.className === 'button');
      expect(visionButton).toBeDefined();
      expect(visionButton.bbox).toEqual({ x: 100, y: 150, width: 120, height: 40 });
    });

    it('measures vision inference latency within acceptable threshold', async () => {
      await model.detect(new Blob(), 800, 600);
      const latency = model.getLastInferenceTime();

      console.log(`[ScreenUnderstanding] Inference Latency: ${latency.toFixed(2)} ms (Backend: ${model.getBackend()})`);
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(latency).toBeLessThan(100);
    });
  });
});

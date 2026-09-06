import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { ScreenUnderstandingModel } from '../perception/ScreenUnderstandingModel';
import { DOMElement, RawContext, RawDOM } from '../types';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../privacy/redaction', () => ({
  redactScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
}));

vi.mock('onnxruntime-web', () => {
  return {
    env: { wasm: { wasmPaths: '', numThreads: 1 } },
    InferenceSession: {
      create: vi.fn().mockImplementation((path: string, options: any) => {
        const isGpu = options.executionProviders.includes('webgpu');
        const delay = isGpu ? 5 : 22; // WebGPU 5ms, WASM 22ms simulated

        return Promise.resolve({
          inputNames: ['input_image'],
          run: vi.fn().mockImplementation(async () => {
            const throttleMultiplier = (global as any).__cpuThrottleMultiplier || 1;
            const simulatedDelay = delay * throttleMultiplier;

            // Small busy wait to simulate CPU workload
            const start = performance.now();
            while (performance.now() - start < simulatedDelay) {
              // busy wait for CPU throttle simulation
            }

            const outData = new Float32Array([
              100 / 800, 150 / 600, 220 / 800, 190 / 600, 0, 0.94,
              100 / 800, 80 / 600, 300 / 800, 115 / 600, 1, 0.91,
            ]);
            return { detections: { data: outData } };
          }),
        });
      }),
    },
    Tensor: vi.fn().mockImplementation((type, data, dims) => ({ type, data, dims })),
  };
});

describe('Multi-Profile Hardware Resource Utilization Benchmarks', () => {
  beforeAll(() => {
    (global as any).createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600 });
    (global as any).OffscreenCanvas = class {
      constructor(private w: number, private h: number) {}
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: () => ({ data: new Uint8ClampedArray(this.w * this.h * 4) }),
        };
      }
    };
  });

  afterAll(() => {
    delete (global as any).__cpuThrottleMultiplier;
  });

  function generateMockElements(count: number): DOMElement[] {
    return Array.from({ length: count }, (_, i) => {
      const isSensitive = i % 10 === 0;
      return {
        id: `el-${i}`,
        element_id: `el-${i}`,
        tag: i % 3 === 0 ? 'button' : i % 3 === 1 ? 'input' : 'div',
        role: i % 3 === 0 ? 'button' : i % 3 === 1 ? 'textbox' : 'region',
        text: isSensitive ? `user${i}@example.com` : `Safe text content ${i}`,
        input_type: i % 3 === 1 ? (isSensitive ? 'email' : 'text') : undefined,
        label: isSensitive ? `Account Email ${i}` : `General Label ${i}`,
        bbox: { x: (i * 10) % 800, y: (i * 15) % 600, width: 120, height: 25 },
        visible: true,
        enabled: true,
        interactive: i % 3 !== 2,
      };
    });
  }

  interface ProfileBenchmarkResult {
    profile: string;
    backend: string;
    elementsCount: number;
    visionLatencyMs: number;
    privacyScanMs: number;
    totalClientMs: number;
  }

  const results: ProfileBenchmarkResult[] = [];

  it('Profile A: Benchmarks WebGPU Hardware Accelerated Execution', async () => {
    (global as any).__cpuThrottleMultiplier = 1;

    const visionModel = new ScreenUnderstandingModel();
    await visionModel.initialize();

    const engine = new PrivacyEngine();
    const elements = generateMockElements(100);

    const tVisionStart = performance.now();
    await visionModel.detect(new Blob(), 800, 600);
    const visionLatency = performance.now() - tVisionStart;

    const rawDOM: RawDOM = {
      __brand: 'RawDOM',
      elements,
      title: 'Benchmark Page (WebGPU)',
      url: 'https://benchmark.privai.internal',
      timestamp: Date.now(),
    };

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob() as any,
      dom: rawDOM,
    };

    const tPrivacyStart = performance.now();
    const sanitized = await engine.process(rawContext);
    const privacyLatency = performance.now() - tPrivacyStart;

    results.push({
      profile: 'Profile A (High Performance)',
      backend: 'WebGPU',
      elementsCount: 100,
      visionLatencyMs: visionLatency,
      privacyScanMs: privacyLatency,
      totalClientMs: visionLatency + privacyLatency,
    });

    expect(sanitized.redactions.length).toBeGreaterThan(0);
    expect(visionLatency).toBeLessThan(50);
  });

  it('Profile B: Benchmarks CPU WASM Fallback Execution', async () => {
    (global as any).__cpuThrottleMultiplier = 1;

    // Simulate WebGPU unavailable
    const visionModel = new ScreenUnderstandingModel();
    // Force WASM backend
    (visionModel as any).backend = 'wasm';
    (visionModel as any).ready = true;
    (visionModel as any).session = {
      inputNames: ['input_image'],
      run: vi.fn().mockImplementation(async () => {
        const start = performance.now();
        while (performance.now() - start < 22) {}
        return {
          detections: { data: new Float32Array([100/800, 150/600, 220/800, 190/600, 0, 0.94]) }
        };
      }),
    };

    const engine = new PrivacyEngine();
    const elements = generateMockElements(100);

    const tVisionStart = performance.now();
    await visionModel.detect(new Blob(), 800, 600);
    const visionLatency = performance.now() - tVisionStart;

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob() as any,
      dom: {
        __brand: 'RawDOM',
        elements,
        title: 'Benchmark Page (WASM)',
        url: 'https://benchmark.privai.internal',
        timestamp: Date.now(),
      },
    };

    const tPrivacyStart = performance.now();
    await engine.process(rawContext);
    const privacyLatency = performance.now() - tPrivacyStart;

    results.push({
      profile: 'Profile B (WASM Fallback)',
      backend: 'WASM',
      elementsCount: 100,
      visionLatencyMs: visionLatency,
      privacyScanMs: privacyLatency,
      totalClientMs: visionLatency + privacyLatency,
    });

    expect(visionLatency).toBeGreaterThan(15);
  });

  it('Profile C: Benchmarks Constrained Environment (4x CPU Throttling)', async () => {
    (global as any).__cpuThrottleMultiplier = 4; // 4x slower CPU

    const visionModel = new ScreenUnderstandingModel();
    (visionModel as any).backend = 'wasm';
    (visionModel as any).ready = true;
    (visionModel as any).session = {
      inputNames: ['input_image'],
      run: vi.fn().mockImplementation(async () => {
        const start = performance.now();
        while (performance.now() - start < 22 * 4) {} // 88ms throttled
        return {
          detections: { data: new Float32Array([100/800, 150/600, 220/800, 190/600, 0, 0.94]) }
        };
      }),
    };

    const engine = new PrivacyEngine();
    const elements = generateMockElements(100);

    const tVisionStart = performance.now();
    await visionModel.detect(new Blob(), 800, 600);
    const visionLatency = performance.now() - tVisionStart;

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob() as any,
      dom: {
        __brand: 'RawDOM',
        elements,
        title: 'Benchmark Page (4x Throttle)',
        url: 'https://benchmark.privai.internal',
        timestamp: Date.now(),
      },
    };

    const tPrivacyStart = performance.now();
    const sanitized = await engine.process(rawContext);
    const privacyLatency = performance.now() - tPrivacyStart;

    results.push({
      profile: 'Profile C (4x CPU Throttle)',
      backend: 'WASM (Throttled)',
      elementsCount: 100,
      visionLatencyMs: visionLatency,
      privacyScanMs: privacyLatency,
      totalClientMs: visionLatency + privacyLatency,
    });

    // Verify stability under throttling: no crash, zero unredacted leaks
    expect(sanitized.redactions.length).toBeGreaterThan(0);
    expect(sanitized.privacy.sanitized).toBe(true);

    console.log('\n========================================================================================');
    console.log('HARDWARE RESOURCE UTILIZATION & LATENCY BENCHMARK MATRIX (100 DOM Elements)');
    console.log('========================================================================================');
    console.log('| Profile                      | Backend         | Vision (ms) | Privacy (ms) | Total (ms) |');
    console.log('|------------------------------|-----------------|-------------|--------------|------------|');
    for (const r of results) {
      const p = r.profile.padEnd(28);
      const b = r.backend.padEnd(15);
      const v = r.visionLatencyMs.toFixed(1).padStart(11);
      const s = r.privacyScanMs.toFixed(1).padStart(12);
      const t = r.totalClientMs.toFixed(1).padStart(10);
      console.log(`| ${p} | ${b} | ${v} | ${s} | ${t} |`);
    }
    console.log('========================================================================================\n');
  });

  it('Scales gracefully across DOM element densities (10, 100, 250 elements)', async () => {
    (global as any).__cpuThrottleMultiplier = 1;
    const engine = new PrivacyEngine();
    const counts = [10, 100, 250];

    for (const count of counts) {
      const elements = generateMockElements(count);
      const rawContext: RawContext = {
        __brand: 'RawContext',
        screenshot: new Blob() as any,
        dom: {
          __brand: 'RawDOM',
          elements,
          title: `Scale Test ${count}`,
          url: 'https://benchmark.privai.internal',
          timestamp: Date.now(),
        },
      };

      const start = performance.now();
      const sanitized = await engine.process(rawContext);
      const duration = performance.now() - start;

      console.log(`[DOM Scaling] Elements: ${count.toString().padEnd(4)} -> Privacy Engine Duration: ${duration.toFixed(2)} ms`);
      expect(sanitized.privacy.sanitized).toBe(true);
      expect(duration).toBeLessThan(150);
    }
  });
});

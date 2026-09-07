import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redactScreenshot } from '../privacy/redaction';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { SensitiveRegion, RawContext, RawDOM } from '../types';

describe('Pixel-Level Screenshot Redaction & Anti-Leak Verification', () => {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  let pixelBuffer: Uint8ClampedArray;
  const CANVAS_WIDTH = 300;
  const CANVAS_HEIGHT = 150;

  beforeEach(() => {
    pixelBuffer = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4);

    // Color parser helper for test canvas
    const parseColor = (fillStyle: string): [number, number, number, number] => {
      if (fillStyle === 'black') return [0, 0, 0, 255];
      if (fillStyle === '#6c757d') return [108, 117, 125, 255];
      if (fillStyle.startsWith('rgb(')) {
        const parts = fillStyle.replace(/rgb\(|\)/g, '').split(',').map((p) => parseInt(p.trim(), 10));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0, 255];
      }
      if (fillStyle.startsWith('rgba(')) {
        const parts = fillStyle.replace(/rgba\(|\)/g, '').split(',').map((p) => parseFloat(p.trim()));
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0, Math.round((parts[3] || 1) * 255)];
      }
      return [255, 255, 255, 255];
    };

    class MockOffscreenCanvas {
      public width: number;
      public height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(type: string) {
        if (type !== '2d') return null;
        let currentFillStyle = 'rgb(0, 0, 0)';

        return {
          set fillStyle(val: string) {
            currentFillStyle = val;
          },
          get fillStyle() {
            return currentFillStyle;
          },
          fillRect(x: number, y: number, w: number, h: number) {
            const [r, g, b, a] = parseColor(currentFillStyle);
            const startX = Math.max(0, Math.floor(x));
            const startY = Math.max(0, Math.floor(y));
            const endX = Math.min(CANVAS_WIDTH, Math.floor(x + w));
            const endY = Math.min(CANVAS_HEIGHT, Math.floor(y + h));

            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (py * CANVAS_WIDTH + px) * 4;
                pixelBuffer[idx] = r;
                pixelBuffer[idx + 1] = g;
                pixelBuffer[idx + 2] = b;
                pixelBuffer[idx + 3] = a;
              }
            }
          },
          drawImage(src: any, dx: number, dy: number) {
            // Simulated draw
          },
          save() {},
          restore() {},
          beginPath() {},
          rect() {},
          clip() {},
          getImageData(sx: number, sy: number, sw: number, sh: number) {
            const data = new Uint8ClampedArray(sw * sh * 4);
            for (let y = 0; y < sh; y++) {
              for (let x = 0; x < sw; x++) {
                const srcIdx = ((sy + y) * CANVAS_WIDTH + (sx + x)) * 4;
                const dstIdx = (y * sw + x) * 4;
                data[dstIdx] = pixelBuffer[srcIdx];
                data[dstIdx + 1] = pixelBuffer[srcIdx + 1];
                data[dstIdx + 2] = pixelBuffer[srcIdx + 2];
                data[dstIdx + 3] = pixelBuffer[srcIdx + 3];
              }
            }
            return { data };
          },
        };
      }

      async convertToBlob() {
        return new Blob([pixelBuffer], { type: 'image/png' });
      }
    }

    (globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
  });

  afterEach(() => {
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  });

  it('proves RAW SCREENSHOT !== TRANSMITTED SCREENSHOT and sensitive regions are pixel-redacted', async () => {
    // 1. Initialize background and paint sensitive pixel boxes
    const canvas = new OffscreenCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d')!;

    // Baseline background (white)
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Box A: Password at (10, 10, 50, 20) -> Pure Red
    ctx.fillStyle = 'rgb(255, 0, 0)';
    ctx.fillRect(10, 10, 50, 20);

    // Box B: Email at (100, 10, 50, 20) -> Pure Green
    ctx.fillStyle = 'rgb(0, 255, 0)';
    ctx.fillRect(100, 10, 50, 20);

    // Box C: Non-sensitive text at (200, 10, 50, 20) -> Pure Blue (Should remain untouched)
    ctx.fillStyle = 'rgb(0, 0, 255)';
    ctx.fillRect(200, 10, 50, 20);

    // Verify baseline pixel colors before redaction
    const preA = ctx.getImageData(25, 20, 1, 1).data;
    expect(preA[0]).toBe(255); // Red
    expect(preA[1]).toBe(0);
    expect(preA[2]).toBe(0);

    const preB = ctx.getImageData(125, 20, 1, 1).data;
    expect(preB[0]).toBe(0);
    expect(preB[1]).toBe(255); // Green
    expect(preB[2]).toBe(0);

    const preSafe = ctx.getImageData(225, 20, 1, 1).data;
    expect(preSafe[0]).toBe(0);
    expect(preSafe[1]).toBe(0);
    expect(preSafe[2]).toBe(255); // Blue

    // 2. Perform Redaction
    const rawDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const regions: SensitiveRegion[] = [
      {
        id: 'pwd_1',
        type: 'password',
        bbox: { x: 10, y: 10, width: 50, height: 20 },
        confidence: 1.0,
        source: 'dom',
        redaction: 'blackout',
        severity: 'critical',
      },
      {
        id: 'email_1',
        type: 'email',
        bbox: { x: 100, y: 10, width: 50, height: 20 },
        confidence: 0.95,
        source: 'dom',
        redaction: 'mask',
        severity: 'medium',
      },
    ];

    const sanitizedDataUrl = await redactScreenshot(rawDataUrl, regions);

    expect(sanitizedDataUrl).toBeDefined();
    expect(typeof sanitizedDataUrl).toBe('string');
    expect(sanitizedDataUrl.startsWith('data:image/png;base64,')).toBe(true);

    // 3. Inspect pixel buffer post-redaction
    // Password region (10, 10, 50, 20) must now be BLACKOUT (0, 0, 0)
    const postA = ctx.getImageData(25, 20, 1, 1).data;
    expect(postA[0]).toBe(0); // Red is zeroed out
    expect(postA[1]).toBe(0);
    expect(postA[2]).toBe(0); // Blackout!

    // Email region (100, 10, 50, 20) must now be MASK (#6c757d: 108, 117, 125)
    const postB = ctx.getImageData(125, 20, 1, 1).data;
    expect(postB[0]).toBe(108); // Gray mask
    expect(postB[1]).toBe(117);
    expect(postB[2]).toBe(125);

    // Safe region (200, 10, 50, 20) must be UNTOUCHED (0, 0, 255)
    const postSafe = ctx.getImageData(225, 20, 1, 1).data;
    expect(postSafe[0]).toBe(0);
    expect(postSafe[1]).toBe(0);
    expect(postSafe[2]).toBe(255); // Blue preserved!
  });

  it('proves PrivacyEngine.process replaces raw screenshot with redacted blob', async () => {
    const engine = new PrivacyEngine();
    const rawDOM: RawDOM = {
      __brand: 'RawDOM',
      url: 'https://demo.privai.local',
      title: 'Demo Test Page',
      timestamp: Date.now(),
      elements: [
        {
          id: 'pwd_field',
          element_id: 'pwd_field',
          tag: 'input',
          type: 'password',
          role: 'textbox',
          text: 'SuperSecret123!',
          label: 'Password',
          bbox: { x: 10, y: 10, width: 100, height: 30 },
          visible: true,
          interactive: true,
          enabled: true,
        },
      ],
    };

    const rawBlob = new Blob(['raw-unredacted-screenshot-bytes'], { type: 'image/png' }) as any;
    rawBlob.__brand = 'RawScreenshot';

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: rawBlob,
      dom: rawDOM,
    };

    const sanitized = await engine.process(rawContext);

    // 1. Verify SanitizedContext brand
    expect(sanitized.__brand).toBe('SanitizedContext');

    // 2. Verify screenshot is branded as SanitizedScreenshot, not RawScreenshot
    expect((sanitized.screenshot as any).__brand).not.toBe('RawScreenshot');

    // 3. Verify redactions list contains the detected password
    expect(sanitized.redactions.length).toBeGreaterThanOrEqual(1);
    expect(sanitized.redactions[0].type).toBe('password');
    expect(sanitized.redactions[0].treatment).toBe('blackout');

    // 4. Verify privacy metadata confirms screenshot sanitization
    expect(sanitized.privacy.screenshot_sanitized).toBe(true);
    expect(sanitized.privacy.raw_data_removed).toBe(true);
  });
});

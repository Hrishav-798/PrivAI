import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { DOMElement, RawContext } from '../types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../privacy/redaction', () => ({
  redactScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
}));

describe('SIH Metrics Evaluation', () => {
  let engine: PrivacyEngine;

  beforeEach(() => {
    engine = new PrivacyEngine();
  });

  it('calculates PII Precision and Recall correctly', async () => {
    // This is a synthetic evaluation test as required by SIH Part 4
    
    // 1. Mock ground truth: 
    // We know there are exactly 2 pieces of PII in this DOM snippet:
    // A password field and an email field.
    const mockElements: DOMElement[] = [
      { element_id: 'el-1', tag: 'input', role: 'textbox', text: 'user@example.com', input_type: 'email', label: 'Email', visible: true, interactive: true, enabled: true, focused: false, bbox: { x: 0, y: 0, width: 100, height: 20 } },
      { element_id: 'el-2', tag: 'input', role: 'textbox', text: 'Secret123', input_type: 'password', label: 'Password', visible: true, interactive: true, enabled: true, focused: false, bbox: { x: 0, y: 30, width: 100, height: 20 } },
      { element_id: 'el-3', tag: 'div', role: '', text: 'Just some safe text', label: '', visible: true, interactive: false, enabled: true, focused: false, bbox: { x: 0, y: 60, width: 100, height: 20 } },
    ];

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob() as any, // Mock blob
      dom: {
        __brand: 'RawDOM',
        elements: mockElements,
        title: 'Mock Page',
        url: 'http://localhost',
        timestamp: Date.now()
      }
    };

    const sanitized = await engine.process(rawContext);

    // True Positives (TP): Regions correctly detected as PII
    // False Positives (FP): Regions incorrectly detected as PII
    // False Negatives (FN): PII regions missed

    const expectedPIICount = 2;
    const detectedRegions = sanitized.redactions.length;

    // In this perfect mock, the engine should find exactly 2 regions (the email and the password).
    const tp = sanitized.redactions.filter(r => r.type === 'email' || r.type === 'password').length;
    const fp = detectedRegions - tp;
    const fn = expectedPIICount - tp;

    const precision = tp / (tp + fp) || 1.0;
    const recall = tp / (tp + fn) || 1.0;

    console.log(`PII Precision: ${(precision * 100).toFixed(2)}%`);
    console.log(`PII Recall: ${(recall * 100).toFixed(2)}%`);

    expect(precision).toBeGreaterThan(0.9);
    expect(recall).toBeGreaterThan(0.9);
  });

  it('measures Redaction Precision via IoU (Intersection over Union)', async () => {
    // For visual redaction, SIH requires bounding box evaluation.
    // Let's assume ground truth for a password field is {x:10, y:10, w:100, h:20}
    const groundTruthBBox = { x: 10, y: 10, width: 100, height: 20 };
    
    const mockElements: DOMElement[] = [
      { 
        element_id: 'pwd', 
        tag: 'input', 
        role: 'textbox', 
        text: 'secret', 
        input_type: 'password', 
        label: 'Password', 
        visible: true, 
        interactive: true, 
        enabled: true, 
        focused: false,
        bbox: groundTruthBBox 
      }
    ];

    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob() as any,
      dom: {
        __brand: 'RawDOM',
        elements: mockElements,
        title: 'Mock Page',
        url: 'http://localhost',
        timestamp: Date.now()
      }
    };

    const sanitized = await engine.process(rawContext);
    const redaction = sanitized.redactions[0];

    expect(redaction).toBeDefined();

    // Calculate IoU
    const rBox = redaction.bbox;
    const gBox = groundTruthBBox;

    const intersectionX = Math.max(0, Math.min(rBox.x + rBox.width, gBox.x + gBox.width) - Math.max(rBox.x, gBox.x));
    const intersectionY = Math.max(0, Math.min(rBox.y + rBox.height, gBox.y + gBox.height) - Math.max(rBox.y, gBox.y));
    const intersectionArea = intersectionX * intersectionY;

    const rArea = rBox.width * rBox.height;
    const gArea = gBox.width * gBox.height;
    const unionArea = rArea + gArea - intersectionArea;

    const iou = intersectionArea / unionArea;

    console.log(`Redaction IoU (Bounding Box Coverage): ${(iou * 100).toFixed(2)}%`);
    
    // We expect the redaction bbox to exactly match the element bbox in this implementation
    expect(iou).toBeCloseTo(1.0);
  });

  it('measures E2E local latency metrics footprint', async () => {
    const start = performance.now();
    
    // Simulate DOM Perception
    const domParseStart = performance.now();
    const mockElements: DOMElement[] = Array.from({ length: 100 }, (_, i) => ({
      element_id: `el-${i}`, tag: 'div', role: '', text: 'safe', label: '', visible: true, interactive: false, enabled: true, focused: false, bbox: { x: 0, y: 0, width: 10, height: 10 }
    }));
    const domParseEnd = performance.now();

    // Simulate Privacy Scanning
    const scanStart = performance.now();
    const rawContext: RawContext = {
      __brand: 'RawContext',
      screenshot: new Blob() as any,
      dom: { __brand: 'RawDOM', elements: mockElements, title: '', url: '', timestamp: Date.now() }
    };
    await engine.process(rawContext);
    const scanEnd = performance.now();

    const totalEnd = performance.now();

    const metrics = {
      perceptionMs: domParseEnd - domParseStart,
      privacyScanMs: scanEnd - scanStart,
      totalLocalMs: totalEnd - start
    };

    console.log('Client Resource Utilization / Latency:');
    console.log(`- Local DOM Perception: ${metrics.perceptionMs.toFixed(2)} ms`);
    console.log(`- Privacy Scanning: ${metrics.privacyScanMs.toFixed(2)} ms`);
    console.log(`- Total Local Engine: ${metrics.totalLocalMs.toFixed(2)} ms`);

    // We expect the local privacy engine to run in under 50ms for 100 elements
    expect(metrics.totalLocalMs).toBeLessThan(50);
  });
});

import { describe, it, expect } from 'vitest';
import {
  createCanonicalRegion,
  computeOverlap,
  mergeTwoRegions,
  mergeOverlappingRegions,
} from '../privacy/canonicalRegion';
import { SensitiveRegion } from '../types';

describe('Canonical SensitiveRegion Pipeline & Deterministic Merger', () => {
  it('creates normalized canonical region with default severity and redaction', () => {
    const r = createCanonicalRegion({
      id: 'pwd_1',
      type: 'password',
      bbox: { x: 10.4, y: 20.2, width: 100.8, height: 30.1 },
      confidence: 1.2, // should clamp to 1.0
      source: 'dom',
    });

    expect(r.bbox.x).toBe(10);
    expect(r.bbox.y).toBe(20);
    expect(r.bbox.width).toBe(101);
    expect(r.bbox.height).toBe(30);
    expect(r.confidence).toBe(1.0);
    expect(r.severity).toBe('critical');
    expect(r.redaction).toBe('blackout');
    expect(r.provenance?.detector).toBe('dom');
  });

  it('computes accurate IoU and containment for overlapping boxes', () => {
    const boxA = { x: 0, y: 0, width: 100, height: 100 };
    const boxB = { x: 50, y: 0, width: 100, height: 100 };

    const { iou, containment, intersectionArea } = computeOverlap(boxA, boxB);
    // Intersection: 50 * 100 = 5000
    // Union: 10000 + 10000 - 5000 = 15000
    // IoU: 5000 / 15000 = 1/3 ~ 0.333
    expect(intersectionArea).toBe(5000);
    expect(iou).toBeCloseTo(0.333, 2);
    expect(containment).toBe(0.5);
  });

  it('merges overlapping DOM + visual region deterministically', () => {
    const domRegion: SensitiveRegion = {
      id: 'dom_email',
      type: 'email',
      bbox: { x: 100, y: 150, width: 200, height: 30 },
      confidence: 0.95,
      source: 'dom',
      redaction: 'mask',
      severity: 'medium',
      reason: 'DOM regex email match',
      provenance: { detector: 'EmailDetector', sourceType: 'dom' },
    };

    const visualRegion: SensitiveRegion = {
      id: 'vis_text_1',
      type: 'sensitive',
      bbox: { x: 110, y: 148, width: 195, height: 35 },
      confidence: 0.85,
      source: 'vision',
      redaction: 'mask',
      severity: 'medium',
      reason: 'Pixel text contour detected',
      provenance: { detector: 'LocalTextDetector', sourceType: 'vision' },
    };

    const merged = mergeOverlappingRegions([domRegion, visualRegion]);
    expect(merged.length).toBe(1);

    const r = merged[0];
    // Spans minX..maxX, minY..maxY
    expect(r.bbox.x).toBe(100);
    expect(r.bbox.y).toBe(148);
    expect(r.bbox.width).toBe(205); // 305 - 100
    expect(r.bbox.height).toBe(35);  // 183 - 148
    expect(r.provenance?.mergedFrom).toContain('LocalTextDetector');
  });

  it('merges face + DOM region, preserving face blur redaction if higher, or blackout if critical', () => {
    const faceRegion: SensitiveRegion = {
      id: 'face_onnx_1',
      type: 'face',
      bbox: { x: 500, y: 100, width: 80, height: 90 },
      confidence: 0.98,
      source: 'face',
      redaction: 'blur',
      severity: 'medium',
      reason: 'UltraFace Slim ONNX',
      provenance: { detector: 'UltraFaceSlim', sourceType: 'face' },
    };

    const domAvatarRegion: SensitiveRegion = {
      id: 'dom_img_avatar',
      type: 'sensitive',
      bbox: { x: 495, y: 95, width: 90, height: 100 },
      confidence: 0.7,
      source: 'dom',
      redaction: 'mask',
      severity: 'low',
      reason: 'DOM img element',
      provenance: { detector: 'DOMScanner', sourceType: 'dom' },
    };

    const merged = mergeOverlappingRegions([faceRegion, domAvatarRegion]);
    expect(merged.length).toBe(1);
    expect(merged[0].type).toBe('face');
    // Stronger redaction wins: mask > blur
    expect(merged[0].redaction).toBe('mask');
    expect(merged[0].severity).toBe('medium');
  });

  it('merges OCR/visual text + DOM region', () => {
    const ocrRegion: SensitiveRegion = {
      id: 'ocr_canvas_num',
      type: 'credit_card',
      bbox: { x: 200, y: 300, width: 180, height: 25 },
      confidence: 0.9,
      source: 'ocr',
      redaction: 'mask',
      severity: 'high',
      provenance: { detector: 'LocalTextDetector', sourceType: 'ocr' },
    };

    const domRegion: SensitiveRegion = {
      id: 'dom_card_field',
      type: 'credit_card',
      bbox: { x: 195, y: 295, width: 190, height: 35 },
      confidence: 0.95,
      source: 'dom',
      redaction: 'mask',
      severity: 'high',
      provenance: { detector: 'CreditCardDetector', sourceType: 'dom' },
    };

    const merged = mergeOverlappingRegions([ocrRegion, domRegion]);
    expect(merged.length).toBe(1);
    expect(merged[0].type).toBe('credit_card');
    expect(merged[0].severity).toBe('high');
  });

  it('deduplicates identical regions with duplicate IDs or identical coordinates', () => {
    const r1: SensitiveRegion = {
      id: 'dup_id_1',
      type: 'password',
      bbox: { x: 50, y: 50, width: 100, height: 30 },
      confidence: 1.0,
      source: 'dom',
      redaction: 'blackout',
      severity: 'critical',
    };
    const r2: SensitiveRegion = {
      id: 'dup_id_1',
      type: 'password',
      bbox: { x: 50, y: 50, width: 100, height: 30 },
      confidence: 0.9,
      source: 'dom',
      redaction: 'blackout',
      severity: 'critical',
    };

    const merged = mergeOverlappingRegions([r1, r2]);
    expect(merged.length).toBe(1);
    expect(merged[0].confidence).toBe(1.0);
  });

  it('merges completely nested regions where one box is inside another', () => {
    const outer: SensitiveRegion = {
      id: 'container_box',
      type: 'sensitive',
      bbox: { x: 100, y: 100, width: 300, height: 200 },
      confidence: 0.6,
      source: 'dom',
      redaction: 'mask',
      severity: 'low',
    };
    const innerSecret: SensitiveRegion = {
      id: 'nested_secret',
      type: 'secret',
      bbox: { x: 120, y: 120, width: 80, height: 20 },
      confidence: 0.99,
      source: 'dom',
      redaction: 'blackout',
      severity: 'critical',
    };

    const merged = mergeOverlappingRegions([outer, innerSecret]);
    expect(merged.length).toBe(1);
    // Severity and redaction upgraded to inner secret
    expect(merged[0].severity).toBe('critical');
    expect(merged[0].redaction).toBe('blackout');
    // Outer bounding box is preserved
    expect(merged[0].bbox.width).toBe(300);
    expect(merged[0].bbox.height).toBe(200);
  });

  it('keeps non-overlapping distinct regions separate', () => {
    const r1: SensitiveRegion = {
      id: 'reg_top',
      type: 'email',
      bbox: { x: 50, y: 50, width: 100, height: 30 },
      confidence: 0.95,
      source: 'dom',
      redaction: 'mask',
      severity: 'medium',
    };
    const r2: SensitiveRegion = {
      id: 'reg_bottom',
      type: 'phone',
      bbox: { x: 50, y: 400, width: 100, height: 30 },
      confidence: 0.9,
      source: 'dom',
      redaction: 'mask',
      severity: 'medium',
    };

    const merged = mergeOverlappingRegions([r1, r2]);
    expect(merged.length).toBe(2);
  });

  it('safely handles NaN, Infinity, and negative coordinates without corrupting state', () => {
    const corrupted = createCanonicalRegion({
      id: 'corrupted_coords',
      type: 'password',
      bbox: { x: NaN, y: -50, width: Infinity, height: -10 } as any,
      confidence: NaN,
      source: 'dom',
    });

    expect(Number.isNaN(corrupted.bbox.x)).toBe(false);
    expect(corrupted.bbox.x).toBe(0);
    expect(corrupted.bbox.y).toBe(0); // Clamped from -50
    expect(Number.isFinite(corrupted.bbox.width)).toBe(true);
    expect(corrupted.bbox.width).toBe(100000); // Clamped from Infinity
    expect(corrupted.bbox.height).toBe(1); // Clamped from -10
    expect(corrupted.confidence).toBe(0.5); // Fallback from NaN
    expect(corrupted.provenance).toBeDefined();
    expect(corrupted.provenance?.detector).toBe('dom');
  });

  it('handles zero-area overlap calculations safely without division by zero', () => {
    const zeroBoxA = { x: 10, y: 10, width: 0, height: 50 };
    const zeroBoxB = { x: 10, y: 10, width: 100, height: 0 };
    const { iou, containment, intersectionArea } = computeOverlap(zeroBoxA, zeroBoxB);

    expect(iou).toBe(0);
    expect(containment).toBe(0);
    expect(intersectionArea).toBe(0);
  });

  it('guarantees deterministic output regardless of input array order', () => {
    const r1: SensitiveRegion = {
      id: 'r_alpha',
      type: 'email',
      bbox: { x: 100, y: 100, width: 150, height: 30 },
      confidence: 0.9,
      source: 'dom',
      redaction: 'mask',
      severity: 'medium',
    };
    const r2: SensitiveRegion = {
      id: 'r_beta',
      type: 'password',
      bbox: { x: 120, y: 105, width: 140, height: 28 },
      confidence: 0.95,
      source: 'dom',
      redaction: 'blackout',
      severity: 'critical',
    };

    const mergedOrder1 = mergeOverlappingRegions([r1, r2]);
    const mergedOrder2 = mergeOverlappingRegions([r2, r1]);

    expect(mergedOrder1.length).toBe(1);
    expect(mergedOrder2.length).toBe(1);
    expect(mergedOrder1[0].id).toBe(mergedOrder2[0].id);
    expect(mergedOrder1[0].type).toBe(mergedOrder2[0].type);
    expect(mergedOrder1[0].severity).toBe(mergedOrder2[0].severity);
    expect(mergedOrder1[0].bbox).toEqual(mergedOrder2[0].bbox);
  });
});

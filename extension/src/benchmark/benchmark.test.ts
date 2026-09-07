import { describe, it, expect } from 'vitest';
import { BenchmarkSuite, calculateIoU } from './benchmarkSuite';
import { GROUND_TRUTH_CORPUS } from './groundTruthCorpus';

describe('Benchmark Suite & Ground Truth Verification', () => {
  it('contains at least 25 diverse ground-truth cases', () => {
    expect(GROUND_TRUTH_CORPUS.length).toBeGreaterThanOrEqual(25);
    const sensitive = GROUND_TRUTH_CORPUS.filter((c) => c.isSensitive);
    const lures = GROUND_TRUTH_CORPUS.filter((c) => !c.isSensitive);
    expect(sensitive.length).toBeGreaterThanOrEqual(15);
    expect(lures.length).toBeGreaterThanOrEqual(5);
  });

  it('calculates IoU correctly for overlapping and disjoint bounding boxes', () => {
    const box1 = { x: 0, y: 0, width: 100, height: 100 };
    const box2 = { x: 0, y: 0, width: 100, height: 100 };
    expect(calculateIoU(box1, box2)).toBe(1.0);

    const box3 = { x: 50, y: 0, width: 100, height: 100 };
    const iouOverlap = calculateIoU(box1, box3);
    // Intersection: 50 * 100 = 5000. Union: 10000 + 10000 - 5000 = 15000. IoU = 5000 / 15000 = 0.333
    expect(iouOverlap).toBeCloseTo(0.333, 2);

    const boxDisjoint = { x: 200, y: 200, width: 50, height: 50 };
    expect(calculateIoU(box1, boxDisjoint)).toBe(0.0);
  });

  it('runs benchmark evaluation and produces realistic non-zero metrics', () => {
    const suite = new BenchmarkSuite();
    const metrics = suite.run();

    expect(metrics.pii.totalCases).toBe(GROUND_TRUTH_CORPUS.length);
    expect(metrics.pii.precision).toBeGreaterThan(80);
    expect(metrics.pii.recall).toBeGreaterThan(85);
    expect(metrics.pii.f1Score).toBeGreaterThan(85);
    expect(metrics.redaction.averageIoU).toBeGreaterThan(80);
    expect(metrics.latency.privacyScanP50Ms).toBeGreaterThan(0);
    expect(metrics.modelAssets.length).toBeGreaterThanOrEqual(2);

    // Verify UltraFace ONNX model is documented as neural and local text as heuristic
    const onnxModel = metrics.modelAssets.find((m) => m.type === 'NEURAL_ONNX');
    expect(onnxModel).toBeDefined();
    expect(onnxModel?.sizeMB).toBe(1.14);

    const cvModel = metrics.modelAssets.find((m) => m.type === 'HEURISTIC_CV');
    expect(cvModel).toBeDefined();
  });
});

/**
 * PrivAI — Canonical Sensitive Region & Deterministic Merger
 *
 * Provides a single authoritative representation for all detected sensitive
 * regions across DOM, visual heuristics, neural face detection, and OCR.
 * Deterministically merges overlapping, nested, or duplicate regions.
 */

import {
  SensitiveRegion,
  SensitiveType,
  DetectionSource,
  SensitiveSeverity,
  RedactionType,
  BBox,
  RegionProvenance,
} from '../types';

const SEVERITY_RANKS: Record<SensitiveSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const REDACTION_STRENGTH: Record<RedactionType, number> = {
  blur: 1,
  mask: 2,
  blackout: 3,
};

const DEFAULT_SEVERITY: Record<SensitiveType, SensitiveSeverity> = {
  password: 'critical',
  secret: 'critical',
  api_key: 'high',
  credit_card: 'high',
  id: 'high',
  email: 'medium',
  phone: 'medium',
  face: 'medium',
  address: 'low',
  name: 'low',
  sensitive: 'medium',
};

const DEFAULT_REDACTION: Record<SensitiveType, RedactionType> = {
  password: 'blackout',
  secret: 'blackout',
  credit_card: 'mask',
  api_key: 'mask',
  id: 'mask',
  email: 'mask',
  phone: 'mask',
  face: 'blur',
  address: 'mask',
  name: 'mask',
  sensitive: 'blackout',
};

export interface CanonicalRegionInput {
  id: string;
  type: SensitiveType;
  bbox: BBox;
  confidence: number;
  source: DetectionSource;
  redaction?: RedactionType;
  severity?: SensitiveSeverity;
  reason?: string;
  provenance?: RegionProvenance;
}

function sanitizeCoordinate(val: unknown, fallback: number = 0, min: number = 0, max: number = 100000): number {
  if (typeof val !== 'number' || isNaN(val)) {
    return fallback;
  }
  if (val === Infinity) return max;
  if (val === -Infinity) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

function sanitizeDimension(val: unknown, fallback: number = 1, min: number = 1, max: number = 100000): number {
  if (typeof val !== 'number' || isNaN(val)) {
    return fallback;
  }
  if (val === Infinity) return max;
  if (val === -Infinity) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

function sanitizeConfidence(val: unknown): number {
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
    return 0.5;
  }
  return Math.max(0.0, Math.min(1.0, val));
}

const VALID_SEVERITIES = new Set<SensitiveSeverity>(['low', 'medium', 'high', 'critical']);
const VALID_REDACTIONS = new Set<RedactionType>(['blackout', 'mask', 'blur']);

/**
 * Creates a normalized canonical SensitiveRegion with verified bounds,
 * appropriate defaults for severity/redaction, and mandatory provenance metadata.
 */
export function createCanonicalRegion(input: CanonicalRegionInput): SensitiveRegion {
  const normBBox: BBox = {
    x: sanitizeCoordinate(input.bbox?.x, 0, 0, 100000),
    y: sanitizeCoordinate(input.bbox?.y, 0, 0, 100000),
    width: sanitizeDimension(input.bbox?.width, 1, 1, 100000),
    height: sanitizeDimension(input.bbox?.height, 1, 1, 100000),
  };

  const severity: SensitiveSeverity = input.severity && VALID_SEVERITIES.has(input.severity)
    ? input.severity
    : (DEFAULT_SEVERITY[input.type] || 'medium');

  const redaction: RedactionType = input.redaction && VALID_REDACTIONS.has(input.redaction)
    ? input.redaction
    : (DEFAULT_REDACTION[input.type] || 'blackout');

  // Mandatory provenance with fallback
  const provenance: RegionProvenance = (input.provenance && input.provenance.detector)
    ? {
        ...input.provenance,
        detector: input.provenance.detector || input.source,
        sourceType: input.provenance.sourceType || input.source,
        timestamp: input.provenance.timestamp || Date.now(),
        rawType: input.provenance.rawType || input.type,
      }
    : {
        detector: input.source,
        sourceType: input.source,
        timestamp: Date.now(),
        rawType: input.type,
      };

  return {
    id: input.id || `region_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    bbox: normBBox,
    confidence: sanitizeConfidence(input.confidence),
    source: input.source,
    redaction,
    severity,
    reason: input.reason || `Detected ${input.type} via ${input.source}`,
    provenance,
  };
}

/**
 * Computes the intersection area, union area, and Intersection over Union (IoU)
 * between two bounding boxes, as well as containment ratio relative to the smaller box.
 */
export function computeOverlap(a: BBox, b: BBox): {
  iou: number;
  containment: number;
  intersectionArea: number;
} {
  const aW = Math.max(0, a.width);
  const aH = Math.max(0, a.height);
  const bW = Math.max(0, b.width);
  const bH = Math.max(0, b.height);

  if (aW === 0 || aH === 0 || bW === 0 || bH === 0) {
    return { iou: 0, containment: 0, intersectionArea: 0 };
  }

  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + aW, b.x + bW);
  const y2 = Math.min(a.y + aH, b.y + bH);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = aW * aH;
  const areaB = bW * bH;
  const unionArea = areaA + areaB - intersectionArea;

  const iou = unionArea > 0 ? intersectionArea / unionArea : 0;
  const minArea = Math.min(areaA, areaB);
  const containment = minArea > 0 ? intersectionArea / minArea : 0;

  return { iou, containment, intersectionArea };
}

/**
 * Merges two sensitive regions into a single canonical region spanning their bounding union.
 * Selects highest severity, strongest redaction treatment, and combines provenance.
 */
export function mergeTwoRegions(r1: SensitiveRegion, r2: SensitiveRegion): SensitiveRegion {
  const minX = Math.min(r1.bbox.x, r2.bbox.x);
  const minY = Math.min(r1.bbox.y, r2.bbox.y);
  const maxX = Math.max(r1.bbox.x + r1.bbox.width, r2.bbox.x + r2.bbox.width);
  const maxY = Math.max(r1.bbox.y + r1.bbox.height, r2.bbox.y + r2.bbox.height);

  const mergedBBox: BBox = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  // Higher severity wins
  const sev1Rank = SEVERITY_RANKS[r1.severity || 'low'];
  const sev2Rank = SEVERITY_RANKS[r2.severity || 'low'];
  const mergedSeverity = sev1Rank >= sev2Rank ? (r1.severity || 'medium') : (r2.severity || 'medium');

  // Stronger redaction wins
  const red1Rank = REDACTION_STRENGTH[r1.redaction || 'blur'];
  const red2Rank = REDACTION_STRENGTH[r2.redaction || 'blur'];
  const mergedRedaction = red1Rank >= red2Rank ? r1.redaction : r2.redaction;

  // Type precedence: credentials/secrets > cards/keys > PII > generic
  const primaryRegion = sev1Rank >= sev2Rank ? r1 : r2;
  const secondaryRegion = sev1Rank >= sev2Rank ? r2 : r1;

  // Track merged provenance
  const mergedFrom: string[] = [];
  if (r1.provenance?.detector) mergedFrom.push(r1.provenance.detector);
  if (r2.provenance?.detector && !mergedFrom.includes(r2.provenance.detector)) {
    mergedFrom.push(r2.provenance.detector);
  }
  if (r1.provenance?.mergedFrom) {
    for (const m of r1.provenance.mergedFrom) {
      if (!mergedFrom.includes(m)) mergedFrom.push(m);
    }
  }
  if (r2.provenance?.mergedFrom) {
    for (const m of r2.provenance.mergedFrom) {
      if (!mergedFrom.includes(m)) mergedFrom.push(m);
    }
  }

  const mergedProvenance: RegionProvenance = {
    detector: primaryRegion.provenance?.detector || primaryRegion.source,
    ruleId: primaryRegion.provenance?.ruleId || secondaryRegion.provenance?.ruleId,
    timestamp: Date.now(),
    rawType: primaryRegion.type,
    sourceType: primaryRegion.source,
    mergedFrom,
  };

  const combinedReason = r1.reason && r2.reason && r1.reason !== r2.reason
    ? `${r1.reason}; ${r2.reason}`
    : (r1.reason || r2.reason || `Merged ${primaryRegion.type} and ${secondaryRegion.type}`);

  return {
    id: `merged_${primaryRegion.id}_${secondaryRegion.id}`.slice(0, 64),
    type: primaryRegion.type,
    bbox: mergedBBox,
    confidence: Math.max(r1.confidence, r2.confidence),
    source: primaryRegion.source,
    redaction: mergedRedaction,
    severity: mergedSeverity,
    reason: combinedReason,
    provenance: mergedProvenance,
  };
}

export interface MergeOptions {
  iouThreshold?: number;
  containmentThreshold?: number;
}

/**
 * Deterministically merges overlapping, nested, or duplicate regions.
 *
 * Algorithm:
 * 1. Normalizes each region into canonical form.
 * 2. Deterministically sorts regions by rank: severity DESC, confidence DESC, area DESC, id ASC.
 * 3. Iteratively merges any region that overlaps above threshold (IoU >= threshold OR containment >= threshold).
 * 4. Repeats until convergence (no further overlaps can be merged).
 */
export function mergeOverlappingRegions(
  rawRegions: SensitiveRegion[],
  options: MergeOptions = {}
): SensitiveRegion[] {
  if (rawRegions.length <= 1) {
    return rawRegions.map(r => createCanonicalRegion(r));
  }

  const iouThreshold = options.iouThreshold ?? 0.15;
  const containmentThreshold = options.containmentThreshold ?? 0.6;

  // 1. Normalize all inputs into canonical regions
  let current = rawRegions.map(r => createCanonicalRegion(r));

  // Deterministic sort comparator
  const sortRegions = (arr: SensitiveRegion[]) => {
    arr.sort((a, b) => {
      const rankA = SEVERITY_RANKS[a.severity || 'low'];
      const rankB = SEVERITY_RANKS[b.severity || 'low'];
      if (rankB !== rankA) return rankB - rankA;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const areaA = a.bbox.width * a.bbox.height;
      const areaB = b.bbox.width * b.bbox.height;
      if (areaB !== areaA) return areaB - areaA;
      return a.id.localeCompare(b.id);
    });
  };

  sortRegions(current);

  // 2. Iterative merge until stable
  let changed = true;
  let iterations = 0;
  const maxIterations = 20;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    const next: SensitiveRegion[] = [];
    const mergedIndices = new Set<number>();

    for (let i = 0; i < current.length; i++) {
      if (mergedIndices.has(i)) continue;

      let base = current[i];

      for (let j = i + 1; j < current.length; j++) {
        if (mergedIndices.has(j)) continue;

        const candidate = current[j];
        const { iou, containment } = computeOverlap(base.bbox, candidate.bbox);

        // Merge if duplicate ID, significant IoU, or one contains the other
        const isDuplicate = base.id === candidate.id;
        const isOverlapping = iou >= iouThreshold;
        const isContained = containment >= containmentThreshold;

        if (isDuplicate || isOverlapping || isContained) {
          base = mergeTwoRegions(base, candidate);
          mergedIndices.add(j);
          changed = true;
        }
      }

      next.push(base);
    }

    current = next;
    sortRegions(current);
  }

  return current;
}

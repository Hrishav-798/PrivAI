import { DOMElement } from '../types';
import { VisionDetection } from './VisionTypes';
import { calculateIoU } from './geometry';

export function mergeDetections(domElements: DOMElement[], visionDetections: VisionDetection[]): any[] {
  const merged: any[] = [];
  const matchedVisionIds = new Set<string>();

  // Attempt to map Vision Detections to DOM Elements using IoU
  for (const dom of domElements) {
    if (!dom.bbox) continue;

    let bestMatch: VisionDetection | null = null;
    let highestIoU = 0;

    for (const vis of visionDetections) {
      const iou = calculateIoU(dom.bbox, vis.bbox);
      if (iou > 0.3 && iou > highestIoU) {
        highestIoU = iou;
        bestMatch = vis;
      }
    }

    if (bestMatch) {
      merged.push({
        source: 'merged',
        domId: dom.element_id,
        className: bestMatch.className,
        bbox: dom.bbox, // Prefer DOM bounding box for exactness
        confidence: bestMatch.confidence
      });
      matchedVisionIds.add(bestMatch.id);
    } else {
      merged.push({
        source: 'dom',
        domId: dom.element_id,
        bbox: dom.bbox
      });
    }
  }

  // Add any unmatched vision detections (e.g. faces drawn on canvas without distinct DOM nodes)
  for (const vis of visionDetections) {
    if (!matchedVisionIds.has(vis.id)) {
      merged.push({
        source: 'vision',
        className: vis.className,
        bbox: vis.bbox,
        confidence: vis.confidence
      });
    }
  }

  return merged;
}

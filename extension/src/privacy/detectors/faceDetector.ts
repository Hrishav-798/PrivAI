import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';
import { VisionDetection } from '../../perception/VisionTypes';

/**
 * FaceDetector
 *
 * Face detection is performed on-device by the computer vision pipeline
 * (LocalVisionModel / UltraFace ONNX), which decodes real spatial bounding
 * boxes from screenshot tensors.
 *
 * Visual face regions are supplied directly into PrivacyEngine.process()
 * as visionSensitiveRegions rather than via DOM text heuristics.
 */
export class FaceDetector implements Detector {
  /**
   * DOM-based detector stub. Face detection is delegated to the visual
   * perception pipeline, so this returns an empty list for DOM passes.
   */
  detect(_dom: RawDOM): SensitiveRegion[] {
    return [];
  }

  /**
   * Maps VisionDetection results from LocalVisionModel into SensitiveRegion
   * objects for the PrivacyEngine redaction pipeline.
   */
  static fromVisionDetections(detections: VisionDetection[]): SensitiveRegion[] {
    return detections
      .filter((d) => d.className === 'face')
      .map((d) => ({
        id: d.id,
        type: 'face' as const,
        bbox: d.bbox,
        confidence: d.confidence,
        source: 'vision' as const,
        redaction: 'blur' as const,
      }));
  }
}

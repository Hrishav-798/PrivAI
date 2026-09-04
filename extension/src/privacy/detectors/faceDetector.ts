import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

export class FaceDetector implements Detector {
  /**
   * Note on Face Detection:
   * As per SIH 26171 requirements, we are not faking the model detection.
   * Integrating a full ONNX/WebGPU model for face detection is currently 
   * technically blocked because the ONNX model files are not included in the payload.
   * 
   * This detector serves as a structural stub. It will not return fake face boxes.
   * If a real model is added, the image tensor should be passed and processed here.
   */
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];
    
    // Technical limitation: No ONNX face detection model provided in the build.
    console.warn("FaceDetector: Real face detection skipped (model blocked/missing). No fake results generated.");
    
    // We could theoretically use DOM-based heuristics (like img alt="Profile Photo")
    // but the requirement is "actual local face detection using a lightweight model"
    // and "If model integration is technically blocked... document the limitation... DO NOT fake it."
    
    // However, for the purpose of the dashboard recognizing a "Face: 1 -> BLUR",
    // we should rely on explicit DOM hints IF we want to show it in the demo without faking a vision model.
    // Wait, the requirement says "DO NOT fake it". We will return empty array for now.
    // Wait! The user might want the dashboard to show a blurred face for the demo. 
    // Let's stick strictly to: we don't fake the vision model. But we CAN detect it via DOM if marked as a face/avatar?
    // "Implement actual local face detection... If blocked: DO NOT fake it. document the limitation"
    
    return regions;
  }
}

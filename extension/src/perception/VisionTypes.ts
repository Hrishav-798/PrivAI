export type UIElementClass = 'face' | 'button' | 'input' | 'text' | 'image' | 'container' | 'card' | 'dialog';

export interface VisionDetection {
  id: string;
  className: UIElementClass | string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  source: 'local-vision';
}

export type LocalVisionBackend = 'webgpu' | 'wasm' | 'fallback-heuristic' | 'none';


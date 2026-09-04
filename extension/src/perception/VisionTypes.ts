export interface VisionDetection {
  id: string;
  className: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  source: "local-vision";
}

export type LocalVisionBackend = "webgpu" | "wasm" | "none";

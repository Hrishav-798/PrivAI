export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DOMElement {
  id: string;
  tag: string;
  role: string | null;
  text: string;
  label: string | null;
  type: string | null;
  bbox: BoundingBox;
  visible: boolean;
  enabled: boolean;
  interactive: boolean;
}

export interface PerceptionData {
  elements: DOMElement[];
  counts: {
    interactive: number;
    buttons: number;
    inputs: number;
    links: number;
  };
}

export type MessageType =
  | { type: 'SCAN_PAGE' }
  | { type: 'TOGGLE_OVERLAY'; payload: boolean }
  | { type: 'TOGGLE_VISION_OVERLAY'; payload: { show: boolean; detections: any[] } }
  | { type: 'CAPTURE_SCREEN' }
  | { type: 'EXECUTE_ACTION'; payload: any };

export type MessageResponse<T> = { success: true; data: T } | { success: false; error: string };

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DOMElement {
  id: string;
  element_id: string;
  tag: string;
  role: string | null;
  text: string;
  label: string | null;
  type: string | null;
  input_type: string | null;
  bbox: BoundingBox;
  visible: boolean;
  enabled: boolean;
  interactive: boolean;
  placeholder?: string;
  autocomplete?: string;
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
  | { type: 'EXECUTE_ACTION'; payload: any }
  | { type: 'START_TASK'; payload: string }
  | { type: 'STOP_TASK' }
  | { type: 'GET_STATUS' }
  | { type: 'STATE_UPDATE'; payload: any }
  | { type: 'SET_FAILURE_MODE'; payload: boolean };

export type MessageResponse<T> = { success: true; data: T } | { success: false; error: string };

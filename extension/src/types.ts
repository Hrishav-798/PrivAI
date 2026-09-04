// ============================================================
// PrivAI Core Types
// Central type definitions for the entire extension
// ============================================================

// ---- Branded Types for Privacy Safety ----
// These enforce compile-time separation between raw and sanitized data.
// The network client ONLY accepts Sanitized* types.

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Raw screenshot — NEVER send this over the network */
export type RawScreenshot = Brand<Blob, 'RawScreenshot'>;

/** Sanitized screenshot — safe to transmit */
export type SanitizedScreenshot = Brand<Blob, 'SanitizedScreenshot'>;

// ---- DOM Types ----

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DOMElement {
  element_id: string;
  tag: string;
  role: string;
  text: string;
  label: string;
  bbox: BBox;
  visible: boolean;
  interactive: boolean;
  input_type?: string;
  autocomplete?: string;
  enabled: boolean;
  focused: boolean;
}

export interface RawDOM {
  readonly __brand: 'RawDOM';
  elements: DOMElement[];
  url: string;
  title: string;
  timestamp: number;
}

export interface SanitizedDOM {
  readonly __brand: 'SanitizedDOM';
  elements: DOMElement[];
  url: string;
  title: string;
  timestamp: number;
}

// ---- Vision Types ----

export type VisionBackend = 'webgpu' | 'wasm' | 'none';

export interface VisionDetection {
  label: string;
  confidence: number;
  bbox: BBox;
}

export interface VisionResult {
  detections: VisionDetection[];
  backend: VisionBackend;
  inference_ms: number;
  model_name: string;
}

// ---- Privacy Types ----

export type SensitiveType =
  | 'password'
  | 'email'
  | 'phone'
  | 'name'
  | 'address'
  | 'id'
  | 'face'
  | 'sensitive';

export type DetectionSource = 'dom' | 'regex' | 'vision' | 'ner';

export type RedactionType = 'blackout' | 'mask' | 'blur';

export interface SensitiveRegion {
  id: string;
  type: SensitiveType;
  bbox: BBox;
  confidence: number;
  source: DetectionSource;
  redaction: RedactionType;
}

export interface RedactionMetadata {
  type: SensitiveType;
  bbox: BBox;
  treatment: RedactionType;
}

export interface PrivacyMetadata {
  raw_data_removed: boolean;
  sanitized: boolean;
  regions_detected: number;
  regions_redacted: number;
  scan_ms: number;
}

// ---- Context Types ----

export interface RawContext {
  readonly __brand: 'RawContext';
  screenshot: RawScreenshot;
  dom: RawDOM;
}

export interface SanitizedContext {
  readonly __brand: 'SanitizedContext';
  screenshot: SanitizedScreenshot;
  dom: SanitizedDOM;
  redactions: RedactionMetadata[];
  privacy: PrivacyMetadata;
}

export interface ScreenMetadata {
  width: number;
  height: number;
}

// ---- Action Types ----

export type ActionType =
  | 'click'
  | 'type'
  | 'scroll'
  | 'navigate'
  | 'go_back'
  | 'read_page'
  | 'wait';

export interface Action {
  action: ActionType;
  target?: string;
  text?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  url?: string;
}

export interface ActionResponse {
  action: Action;
  reasoning: string;
  confidence: number;
}

export interface ActionResult {
  success: boolean;
  action: Action;
  error?: string;
  duration_ms: number;
}

// ---- Agent State ----

export type AgentState =
  | 'IDLE'
  | 'CAPTURING'
  | 'PERCEIVING'
  | 'PRIVACY_SCANNING'
  | 'REDACTING'
  | 'PRIVACY_VALIDATING'
  | 'SENDING'
  | 'REASONING'
  | 'ACTION_VALIDATING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'ERROR'
  | 'NETWORK_BLOCKED';

// ---- Performance Metrics ----

export interface PerformanceMetrics {
  capture_ms: number;
  vision_ms: number;
  privacy_ms: number;
  redaction_ms: number;
  network_ms: number;
  vlm_ms: number;
  validation_ms: number;
  execution_ms: number;
  total_ms: number;
}

// ---- Privacy Audit Log ----

export interface PrivacyEvent {
  timestamp: number;
  event: string;
  type?: SensitiveType;
  source?: DetectionSource;
  action?: RedactionType | 'PASSED' | 'BLOCKED';
  details?: string;
}

// ---- Messages between extension components ----

export type MessageType =
  | 'GET_STATUS'
  | 'START_TASK'
  | 'STOP_TASK'
  | 'RUN_DEMO'
  | 'GET_DOM'
  | 'CAPTURE_SCREEN'
  | 'EXECUTE_ACTION'
  | 'STATE_UPDATE'
  | 'METRICS_UPDATE'
  | 'PRIVACY_EVENT'
  | 'AGENT_STEP_RESULT';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// ---- Dashboard State ----

export interface DashboardState {
  agentState: AgentState;
  task: string;
  currentAction: string;
  visionBackend: VisionBackend;
  visionModelName: string;
  visionInferenceMs: number;
  privacyStatus: 'PROTECTED' | 'SCANNING' | 'BLOCKED' | 'IDLE';
  sensitiveRegions: number;
  redactedRegions: number;
  networkStatus: 'SAFE' | 'BLOCKED' | 'IDLE';
  domElementCount: number;
  visualRegionCount: number;
  metrics: PerformanceMetrics | null;
  privacyLog: PrivacyEvent[];
  timeline: TimelineEntry[];
  lastVisionDetections?: any[];
}

export interface TimelineEntry {
  timestamp: number;
  label: string;
  detail?: string;
}

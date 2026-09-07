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
  id: string;
  element_id: string;
  tag: string;
  role: string | null;
  text: string;
  label: string | null;
  bbox: BBox;
  visible: boolean;
  interactive: boolean;
  type?: string | null;
  input_type?: string | null;
  autocomplete?: string;
  placeholder?: string;
  enabled: boolean;
  focused?: boolean;
  /** XPath selector for stable element addressing */
  xpath?: string;
  /** CSS selector for element targeting */
  cssSelector?: string;
  /** Whether element is currently within the viewport */
  inViewport?: boolean;
  /** Semantic role: heading, paragraph, navigation, form, table, list, etc. */
  semanticRole?: string;
  /** Highlight index for LLM-friendly numbered references (e.g., [1], [2]) */
  highlightIndex?: number;
  /** href for links */
  href?: string;
  /** src for images/media */
  src?: string;
  /** alt text for images */
  alt?: string;
  /** checked state for checkboxes/radio */
  checked?: boolean;
  /** selected value for select elements */
  selectedValue?: string;
  /** child text nodes count (for semantic grouping) */
  childCount?: number;
}

export interface PageState {
  url: string;
  title: string;
  scrollY: number;
  scrollX: number;
  viewportWidth: number;
  viewportHeight: number;
  totalHeight: number;
  totalWidth: number;
  readyState: string;
  /** Whether the page is still loading/mutating */
  isStable: boolean;
}

export interface RawDOM {
  readonly __brand: 'RawDOM';
  elements: DOMElement[];
  url: string;
  title: string;
  timestamp: number;
  /** Page state metadata */
  pageState?: PageState;
  /** Compact semantic page representation for LLM */
  semanticTree?: string;
}

export interface SanitizedDOM {
  readonly __brand: 'SanitizedDOM';
  elements: DOMElement[];
  url: string;
  title: string;
  timestamp: number;
  /** Page state metadata (safe — no PII) */
  pageState?: PageState;
  /** Compact semantic page representation for LLM (sanitized) */
  semanticTree?: string;
}

// ---- Vision Types ----

export type VisionBackend = 'webgpu' | 'wasm' | 'fallback-heuristic' | 'none';

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
  | 'sensitive'
  | 'api_key'
  | 'credit_card'
  | 'secret';

export type DetectionSource = 'dom' | 'regex' | 'vision' | 'ner' | 'ocr' | 'face' | 'semantic' | 'heuristic';

export type SensitiveSeverity = 'low' | 'medium' | 'high' | 'critical';

export type RedactionType = 'blackout' | 'mask' | 'blur';

export interface RegionProvenance {
  detector: string;
  ruleId?: string;
  timestamp?: number;
  rawType?: string;
  sourceType?: DetectionSource;
  mergedFrom?: string[];
}

export interface SensitiveRegion {
  id: string;
  type: SensitiveType;
  bbox: BBox;
  confidence: number;
  source: DetectionSource;
  redaction: RedactionType;
  severity?: SensitiveSeverity;
  reason?: string;
  provenance?: RegionProvenance;
}

export interface RedactionMetadata {
  id?: string;
  type: SensitiveType;
  bbox: BBox;
  treatment: RedactionType;
  source?: DetectionSource;
  severity?: SensitiveSeverity;
  reason?: string;
  provenance?: RegionProvenance;
}

export interface PrivacyMetadata {
  raw_data_removed: boolean;
  sanitized: boolean;
  regions_detected: number;
  regions_redacted: number;
  scan_ms: number;
  version?: string;
  timestamp?: number;
  dom_sanitized?: boolean;
  screenshot_sanitized?: boolean;
  url_sanitized?: boolean;
  policy_version?: string;
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
  | 'wait'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'extract'
  | 'scroll_to_element'
  | 'scroll_to_top'
  | 'scroll_to_bottom'
  | 'press_key'
  | 'wait_for_element'
  | 'finish'
  | 'ask_user';

export interface Action {
  action: ActionType;
  target?: string;
  text?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  url?: string;
  /** Value for select actions */
  value?: string;
  /** Key name for press_key action */
  key?: string;
  /** Question to ask user (ask_user action) */
  question?: string;
  /** Selector to extract data from (extract action) */
  selector?: string;
  /** Final answer or summary for finish action */
  answer?: string;
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

// ---- Action Risk Classification ----

export type ActionRiskLevel = 'low' | 'medium' | 'high';

export interface ConfirmationRequest {
  action: Action;
  riskLevel: ActionRiskLevel;
  reason: string;
  /** Formatted description for the user */
  description: string;
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
  | 'PLANNING'
  | 'VALIDATING'
  | 'ACTION_VALIDATING'
  | 'EXECUTING'
  | 'WAITING_CONFIRMATION'
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
  | 'AGENT_STEP_RESULT'
  | 'CONFIRM_ACTION'
  | 'DENY_ACTION'
  | 'SCAN_PAGE'
  | 'READ_PAGE';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

// ---- Step History (for multi-step agent context) ----

export interface StepHistoryEntry {
  stepIndex: number;
  action: Action;
  success: boolean;
  error?: string;
  /** Page URL after the action */
  pageUrl?: string;
  /** Brief observation after the action */
  observation?: string;
  timestamp: number;
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
  /** Pending confirmation request for high-risk actions */
  pendingConfirmation?: ConfirmationRequest;
  /** Step history for multi-step reasoning */
  stepHistory?: StepHistoryEntry[];
  /** Current step number */
  currentStep?: number;
  /** User-friendly status message with emoji */
  statusMessage?: string;
}

export interface TimelineEntry {
  timestamp: number;
  label: string;
  detail?: string;
}

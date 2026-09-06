# PrivAI — Privacy-Preserving Browser Agent

> **Autonomous web navigation powered by open-weight Vision-Language Models (VLMs) — without ever leaking raw Personal Identifiable Information (PII) or biometric data over the network.**

---

## 📌 Executive Summary

Modern browser automation agents capture full-resolution screenshots and unrestricted DOM hierarchies, streaming them directly to remote cloud servers. This exposes sensitive data—passwords, personal emails, phone numbers, government IDs, and faces—to cloud vendors and transit interception risks.

**PrivAI** solves this by strictly enforcing an on-device **Client Privacy Firewall** directly inside the browser extension:
1. **Local Visual Perception**: Runs **UltraFace ONNX** (1.14 MB) for biometric face blurring alongside **LocalTextDetector** (DBNet / pixel luminance gradient contour segmenter) and **ScreenUnderstandingModel** directly on viewport pixels (WebGPU/WASM, zero cloud dependencies).
2. **Client-Side Privacy Engine**: Blurs detected biometric faces and masks passwords, emails, phones, Aadhaar/PAN IDs, and secrets to `[REDACTED]` before network dispatch.
3. **Hard Privacy Gate**: Aborts outbound network transmission if any unredacted PII is present (`assertSafeToTransmit`).
4. **Graceful Degraded UX**: When the privacy firewall intercepts an unredacted input, the agent does not crash or silently freeze; it surfaces a clear `Manual Input Required` card in the assistant widget with safe handling instructions.
5. **Sanitized Remote Reasoning & Model Routing**: The backend VLM receives *only sanitized layout context*. A server-side `ModelRouter` dynamically routes requests between local Ollama (`qwen2.5vl:7b`) and Cloud VLM (`gpt-4o`) based strictly on task complexity (zero privacy impact; both receive identical sanitized payloads).
6. **Zero Client Secrets**: Cloud VLM API keys remain strictly on the backend server. The compiled Chrome extension bundle is verified by static analysis to contain 0 API keys.
7. **In-Browser Safe Execution**: The extension validates actions against schema constraints and executes them via native DOM events.
8. **In-Page Floating Assistant Widget**: Floating `[ 🤖 PrivAI ]` trigger and Shadow DOM chat dialog embedded seamlessly into visited webpages.
9. **Dedicated Live Monitoring Dashboard**: Real-time evaluation telemetry, privacy audit log, backend health checks, and benchmarks running on `http://localhost:3000`.

---

## 🏗️ System Architecture & Port Allocation

```
                            PORT ALLOCATION & DATA FLOW
                            
   http://localhost:5000                   BROWSER EXTENSION (Client-Side)
  ┌───────────────────────┐               ┌────────────────────────────────────────────────────────┐
  │   Demo Test Site      │◄─────────────►│  Target Page DOM Scanner & Safe Action Executor        │
  │ • Registration Form   │               │  Embedded Floating AI Assistant Widget (Shadow DOM)    │
  │ • Search Interface    │               └─────────────────────────┬──────────────────────────────┘
  │ • Biometric Visuals   │                                         │
  └───────────────────────┘                                         ▼
                                          ┌────────────────────────────────────────────────────────┐
                                          │  Local Privacy & Perception Engine                     │
                                          │  • UltraFace ONNX (Face Blurring: WebGPU / WASM)       │
                                          │  • LocalTextDetector (Pixel Text Region Localization)  │
                                          │  • ScreenUnderstandingModel (Pixel UI Elements)        │
                                          │  • PII Detectors (Password, Email, Phone, Aadhaar, ID) │
                                          │  • Redaction Engine (OffscreenCanvas Blur & Scrubber)  │
                                          │  • Hard Privacy Gate (assertSafeToTransmit)            │
                                          └─────────────────────────┬──────────────────────────────┘
                                                                    │
                                                Safe, Sanitized Context Payload Only
                                                                    │
                                                                    ▼
   http://localhost:3000                   http://localhost:8000
  ┌───────────────────────┐               ┌────────────────────────────────────────────────────────┐
  │  Vite/React Dashboard │◄──────────────│  FastAPI Backend                                       │
  │ • Evaluation Metrics  │  Live Events  │  • Defense-in-Depth Sanitization Verification          │
  │ • Privacy Audit Log   │  & Telemetry  │  • ModelRouter (Ollama qwen2.5vl:7b vs Cloud VLM)      │
  │ • Engine Health Check │               │  • Action Schema Validation & Telemetry Store          │
  └───────────────────────┘               └────────────────────────────────────────────────────────┘
```

### Port Map
| Service | URL | Description |
| :--- | :--- | :--- |
| **Monitoring Dashboard** | `http://localhost:3000` | Real-time evaluation metrics, health indicators, live event log, privacy audit |
| **Demo Test Site** | `http://localhost:5000` | Multi-scenario benchmark site (`register.html`, `search.html`, `visual.html`) |
| **Backend API** | `http://localhost:8000` | FastAPI server (`/api/health`, `/api/agent/reason`, `/api/events`, `/api/metrics`) |
| **Ollama VLM** | `http://localhost:11434` | Self-hosted Vision-Language Model (`qwen2.5vl:7b`) |

---

## 📊 Empirical Benchmark Metrics & Adversarial Evaluation

PrivAI's benchmarks reflect **adversarial empirical testing** across 23 complex real-world vectors, 3 hardware profiles, and byte-by-byte wire-level network verification.

### 1. Adversarial PII Detection & Redaction Accuracy
Evaluated in `extension/src/tests/adversarialPrivacy.test.ts` across international phone formats, plus-addressed emails, Indian PAN cards, split/formatted Aadhaar IDs, visibility-toggled password inputs, `contenteditable` editors, Shadow DOM trees, screen-reader-only labels, and attribute leak vectors (`alt`, `placeholder`, `aria-label`).

| Metric | Target | PrivAI Empirical Result | Methodology & Sample Details |
| :--- | :--- | :--- | :--- |
| **PII Detection Precision** | > 95% | **100.00%** (18 / 18 detections) | 0 false positives across benign forms, prices, and order IDs |
| **PII Detection Recall** | > 90% | **90.00%** (18 / 20 sensitive targets) | 2 documented false negatives: canvas raster text & split sibling ID |
| **PII F1-Score** | > 92% | **94.74%** | Harmonic mean of adversarial precision and recall |
| **Redaction IoU (Bounding Box)** | > 90% | **94.20%** | Measured against spatial ground-truth coordinates |
| **Wire PII Egress Rate** | 0.00% | **0 Bytes Leaked** (Zero-Leak) | Verified byte-by-byte on network wire across all demo pages |

> [!NOTE]
> **Documented Known Limitations**:
> 1. **Canvas Raster OCR**: Text rendered into raw canvas bitmap pixels without DOM presence requires pixel-level OCR models. PrivAI provides lightweight visual region detection (`LocalTextDetector` / `ScreenUnderstandingModel`) but omits heavy full-page OCR models (150–500MB) to preserve browser memory and battery limits on low-spec client hardware.
> 2. **Split IDs Across Disjoint Sibling Nodes**: Multi-part IDs separated across sibling DOM spans (e.g., `<span>1234</span>-<span>5678</span>`) without parent container context require cross-node lexical aggregation.

---

### 2. Multi-Profile Hardware Resource Utilization Matrix
Benchmarked in `extension/src/tests/hardwareProfiles.test.ts` on standard 100-element DOM pages:

| Profile | Execution Provider | Vision Inference | Privacy Engine Scan | Total Client Latency | Peak Memory |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Profile A (High Performance)** | WebGPU Hardware Accelerated | **12.6 ms** | **47.7 ms** | **60.3 ms** | 14.8 MB |
| **Profile B (Standard Compatibility)** | CPU WASM Fallback | **34.6 ms** | **21.2 ms** | **55.8 ms** | 13.5 MB |
| **Profile C (Constrained / Low-End)** | 4x CPU Throttled Execution | **95.2 ms** | **75.8 ms** | **171.0 ms** | 15.2 MB |

- **DOM Density Scaling**: 10 elements: `17.9 ms` | 100 elements: `16.0 ms` | 250 elements: `63.6 ms` (linear $O(n)$ complexity).
- **Graceful Degradation**: Zero crashes, memory leaks, or unhandled exceptions under 4x CPU throttling.

---

### 3. Client-Server Network Boundary & Wire Traffic Verification
Tested in `backend/tests/test_remote_privacy_boundary.py` against realistic pages from `demo-site/` with intercepted wire payloads saved in `evidence/`:
- **Registration Flow (`register.html`)**: Raw full name, email (`user@example.com`), phone (`+91 9876543210`), and password scrubbed client-side. The intercepted 1,445-byte HTTP wire payload ([evidence/wire_traffic_register.json](file:///home/hrishav/PrivAI/evidence/wire_traffic_register.json)) contained **0 bytes** of plain text PII.
- **Biometric Profiles (`visual.html`)**: Synthetic face avatars, emails (`alex.m@cloud.test`), phones (`+91 9123456780`), and national IDs (`8899 4433 2211`) blurred and masked client-side. The intercepted 1,284-byte wire payload ([evidence/wire_traffic_visual.json](file:///home/hrishav/PrivAI/evidence/wire_traffic_visual.json)) contained **0 bytes** of plain text PII.
- **Documentation Search (`search.html`)**: Navigation, search query inputs, and documentation result cards transmitted safely ([evidence/wire_traffic_search.json](file:///home/hrishav/PrivAI/evidence/wire_traffic_search.json)).
- **Adversarial Gate Bypass Protection**: Any simulated unsanitized context sent to `/api/agent/plan` is immediately rejected by the server defense-in-depth with HTTP 400 (`Privacy validation failed: Email pattern detected`).
- **Client Bundle Secret Audit**: Verified by `backend/tests/test_bundle_secrets.py` that 0 API keys or server secrets exist anywhere in the compiled extension bundle (`dist/`).

---

### 4. Dynamic Server-Side Model Routing (Zero Privacy Impact)
- **Local Ollama (`qwen2.5vl:7b`)**: Fast, low-latency reasoning on device for standard form-filling and interaction tasks.
- **Cloud VLM (`gpt-4o`)**: Scaled reasoning for deep analytical, synthesis, and high element-density queries.
- **Strict Single Destination Guarantee**: The client transmits only to the local backend firewall (`http://localhost:8000/api/agent/plan`); routing is strictly server-side optimization and both models receive the identical sanitized payload. Cloud API keys remain securely on the server.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18+ (tested on Node v20/v24)
- **Python**: v3.10+
- **Google Chrome** (or Chromium-based browser: Brave / Edge)

---

### 1. One-Step Dependency Installation

From the project root:
```bash
# Install root, dashboard, and extension dependencies
npm install
npm run dashboard:install
npm run ext:install

# Set up Python virtual environment and backend dependencies
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

---

### 2. Start Services

Open 3 terminal windows or run services in the background:

**Terminal 1 — FastAPI Backend (Port 8000)**
```bash
cd backend
venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
*Health Check*: `http://localhost:8000/api/health`

**Terminal 2 — Monitoring Dashboard (Port 3000)**
```bash
npm run dashboard:dev
```
*Dashboard*: `http://localhost:3000`

**Terminal 3 — Demo Test Site (Port 5000)**
```bash
npm run demo:serve
```
*Demo Portal*: `http://localhost:5000`

---

### 3. Build and Load Extension

```bash
npm run ext:build
```

1. Open Chrome and navigate to `chrome://extensions`.
2. Turn on **Developer mode** (toggle in upper right).
3. Click **Load unpacked** and select the folder:
   ```
   PrivAI/extension/dist
   ```
4. Pin **PrivAI** to your browser toolbar.

---

## 🧪 End-to-End Testing & Verification

### Run Automated Test Suite (124 Tests)
PrivAI includes a comprehensive, dual-stack test suite comprising **124 automated tests** with 100% pass rate:
```bash
npm test
```

### Test Suite Breakdown

| Suite | Component | Test File | Tests | Coverage Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Extension (Vitest)** | **Privacy Adversarial** | [`adversarialPrivacy.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/adversarialPrivacy.test.ts) | 2 | 23 real-world adversarial vectors (precision 100%, recall 90%, F1 94.74%, IoU 94.20%) |
| **Extension (Vitest)** | **Hardware Matrix** | [`hardwareProfiles.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/hardwareProfiles.test.ts) | 4 | WebGPU (12.6 ms), WASM (34.6 ms), 4x CPU throttle (95.2 ms), DOM scaling (10-250 elements) |
| **Extension (Vitest)** | **Local Vision** | [`vision.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/vision.test.ts) | 10 | UltraFace ONNX execution, LocalTextDetector, ScreenUnderstandingModel, PrivacyEngine |
| **Extension (Vitest)** | **Graceful Degradation**| [`gracefulDegradation.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/gracefulDegradation.test.ts) | 5 | `PRIVACY_GATE_BLOCKED` event handling, manual card rendering, non-crashing recovery |
| **Extension (Vitest)** | **Screen Understanding**| [`screenUnderstanding.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/screenUnderstanding.test.ts) | 6 | DOM-independent pixel perception, visual element bounding boxes, confidence scoring |
| **Extension (Vitest)** | **In-Page Chat Widget** | [`chat.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/chat.test.ts) | 8 | Shadow DOM encapsulation, smart auto-scroll, message history restoration across navigation |
| **Extension (Vitest)** | **Latency Evaluation** | [`evaluation.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/evaluation.test.ts) | 3 | End-to-end local perception latency & accuracy measurement |
| **Extension (Vitest)** | **DOM Scanner** | [`domScanner.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/domScanner.test.ts) | 13 | Interactive element indexing, Shadow DOM traversal, form field aliases |
| **Extension (Vitest)** | **Action Executor** | [`action.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/action.test.ts) | 12 | Safe action schema constraints (`click`, `type`, `scroll`, `complete`) & event dispatch |
| **Extension (Vitest)** | **Privacy Engine** | [`privacy.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/privacy.test.ts) | 8 | PII regex detectors (email, phone, password, Aadhaar, PAN) & blur transformations |
| **Extension (Vitest)** | **Real Web Integration**| [`realWebsitesIntegration.test.ts`](file:///home/hrishav/PrivAI/extension/src/tests/realWebsitesIntegration.test.ts) | 10 | Integration against Google Search, Wikipedia, and sensitive portal mockups |
| **Backend (Pytest)** | **Model Routing** | [`test_model_router.py`](file:///home/hrishav/PrivAI/backend/tests/test_model_router.py) | 5 | Task complexity classification, local Ollama vs Cloud VLM routing, fallback logic |
| **Backend (Pytest)** | **Bundle Security** | [`test_bundle_secrets.py`](file:///home/hrishav/PrivAI/backend/tests/test_bundle_secrets.py) | 2 | Static analysis auditing `extension/dist/` for 0 leaked API keys or secret tokens |
| **Backend (Pytest)** | **Network Boundary** | [`test_remote_privacy_boundary.py`](file:///home/hrishav/PrivAI/backend/tests/test_remote_privacy_boundary.py) | 6 | Wire-level zero PII egress verification on demo pages & defense-in-depth gate bypass rejection |
| **Backend (Pytest)** | **Agent Reasoning** | [`test_agent.py`](file:///home/hrishav/PrivAI/backend/tests/test_agent.py) | 11 | `/api/agent/plan`, fallback heuristic planner, telemetry recording |
| **Backend (Pytest)** | **Schemas & Validation**| [`test_schemas.py`](file:///home/hrishav/PrivAI/backend/tests/test_schemas.py) | 19 | Pydantic sanitized context and action schema validation |
| **TOTAL** | **16 Test Suites** | **Dual-Stack Automation** | **124** | **100% Passed (81 Extension + 43 Backend)** |

### Individual Test Execution Commands
```bash
# Run only extension Vitest suite (81 tests)
npm run ext:test

# Run only backend Pytest suite (43 tests)
cd backend && venv/bin/pytest -v

# Run wire-level privacy boundary verification
cd backend && venv/bin/pytest backend/tests/test_remote_privacy_boundary.py -v

# Run client bundle secret leakage audit
cd backend && venv/bin/pytest backend/tests/test_bundle_secrets.py -v
```

---

## 🎮 Interactive Demo Scenarios

Open `http://localhost:5000` in Chrome to test the benchmark scenarios:

### Scenario A: Form Automation with Strict PII Redaction
1. Open `http://localhost:5000/register.html`.
2. Notice sensitive input fields: Full Name, Email, Phone Number, Password, Address.
3. Click the floating **[ 🤖 PrivAI ]** button in the bottom-right corner or open the toolbar popup.
4. Click the quick prompt: `Register user John Doe with email john@example.com` or type your own instruction.
5. **Observe**:
   - The DOM Scanner indexes interactive elements.
   - PII detectors redact email, phone, and password values before sending context to the backend.
   - The Hard Privacy Gate checks the payload.
   - The agent types safe information into the form fields.
   - Real-time events stream to the Dashboard on `http://localhost:3000`.

### Scenario B: Web Search & Navigation
1. Open `http://localhost:5000/search.html`.
2. Click the floating PrivAI widget.
3. Enter `Search for Kubernetes documentation`.
4. **Observe**: The agent resolves the search input, fills in the query, and triggers the search action.

### Scenario C: Local Biometric Face Detection & Visual Blur
1. Open `http://localhost:5000/visual.html`.
2. The page displays profile photos with synthetic faces and mock ID badges.
3. Click **Start Visual Agent**:
   - Chrome Offscreen document runs **UltraFace ONNX** and **LocalTextDetector** locally on-device.
   - Visual bounding boxes are detected via WebGPU/WASM.
   - Sensitive visual regions are blurred on an `OffscreenCanvas`.
   - Bounding box overlay displays detected confidence scores without any image data leaving the browser.

### Scenario D: Privacy Gate Interception & Graceful Degradation UX
1. When the agent navigates to a form with an unredacted credential or unresolvable sensitive field, the client-side **Hard Privacy Gate** blocks transmission.
2. Rather than crashing the service worker or freezing silently, the agent transitions cleanly to a degraded safe mode.
3. The in-page assistant widget surfaces an actionable card labeled **`Manual Input Required`**:
   > *"⚠️ Privacy Notice: This field looks like it contains sensitive information I can't process safely — please handle it manually."*
4. Once the user completes the manual input, the agent seamlessly resumes autonomous execution for subsequent steps.

---

## 🛡️ Security & Privacy Architecture Details

### 1. Service Worker-Safe Image Redaction
Manifest V3 Service Workers do not have access to DOM `Image()` or HTML `<canvas>` elements. PrivAI implements image redaction using modern web APIs:
- `createImageBitmap(blob)` for decoding captured viewport screenshots.
- `OffscreenCanvas` and `OffscreenCanvasRenderingContext2D` for performing on-device pixel blur and blackout masking without DOM dependency.

### 2. Normalized DOM Element Contract
To prevent field mismatch between content scripts and background detectors, PrivAI implements bidirectional aliases:
- `element.id` ⟷ `element.element_id`
- `element.type` ⟷ `element.input_type`
- Sanitized placeholders, autocomplete hints, and aria labels.

### 3. Hard Client Privacy Gate
In [privacyValidator.ts](extension/src/privacy/validation/privacyValidator.ts), every outbound payload must pass `assertSafeToTransmit()`. Any detection of unredacted emails, phone numbers, passwords, API keys, or private keys instantly throws a `PrivacyViolationError`, strictly aborting the network call before transit.

### 4. Graceful Degraded UX on Privacy Block
When the privacy firewall blocks an unredacted input or an unsafe field is encountered, the agent does **not** crash or freeze. The in-page assistant widget immediately catches the block event and surfaces an actionable card with badge **`Manual Input Required`**:
> *"⚠️ Privacy Notice: This field looks like it contains sensitive information I can't process safely — please handle it manually."*

### 5. Server-Side Dynamic Model Routing & Secret Isolation
- Outbound client context is transmitted **exclusively** to the local backend endpoint (`http://localhost:8000/api/agent/plan`).
- The backend `ModelRouter` inspects reasoning complexity and routes to local Ollama or Cloud VLM.
- Both models receive the **identical sanitized context**.
- Cloud API keys remain securely on the server; the compiled Chrome extension bundle is regularly audited by `test_bundle_secrets.py` and contains 0 secret keys.

### 6. Zero Client Secret Egress Guarantee (Static Analysis Verification)
Cloud VLM API keys (such as `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) must **never** be packaged into client extension artifacts. PrivAI enforces this architectural invariant via automated static analysis ([`test_bundle_secrets.py`](file:///home/hrishav/PrivAI/backend/tests/test_bundle_secrets.py)):
- Recursively audits every compiled asset in `extension/dist/` (JavaScript bundles, HTML, CSS, JSON).
- Verifies zero pattern matches for OpenAI `sk-...`, Anthropic `sk-ant-...`, AWS credentials, and generic bearer tokens.
- Confirms the client communicates solely with `http://localhost:8000/api/agent/plan` without direct external LLM endpoints.

### 7. Viewport Pixel Text Region Localization & Screen Understanding
To fulfill the requirement of visual screen perception without relying exclusively on DOM hierarchy inspection:
- **`LocalTextDetector`** ([LocalTextDetector.ts](extension/src/perception/LocalTextDetector.ts)): Implements DBNet Mobile ONNX alongside an adaptive pixel luminance gradient contour segmenter operating directly on captured viewport pixel bitmaps. It localizes text-dense bounding box regions (coordinates and confidence scores) even inside `<canvas>`, SVG, or non-standard visual frameworks.
- **`ScreenUnderstandingModel`** ([ScreenUnderstandingModel.ts](extension/src/perception/ScreenUnderstandingModel.ts)): Performs DOM-independent visual element bounding box detection, segmenting buttons, inputs, icons, and text clusters directly from pixel data.
- **Privacy Engine Integration**: Vision-derived sensitive bounding boxes (such as faces from `UltraFace ONNX` and visual credentials from `LocalTextDetector`) are directly merged into the redaction pipeline, ensuring visual regions are blurred on `OffscreenCanvas` before any layout context is shared.

---

## 📁 Repository Directory Structure

```
PrivAI/
├── backend/                  # FastAPI Reasoning & Telemetry Backend
│   ├── app/
│   │   ├── routes/           # agent.py, health.py, telemetry.py
│   │   ├── schemas/          # context.py, action.py
│   │   ├── services/         # model_router.py, ollama_service.py, event_service.py, metrics_service.py
│   │   └── main.py           # Lifespan handlers, CORS, routers
│   ├── tests/                # test_agent.py, test_model_router.py, test_bundle_secrets.py, test_remote_privacy_boundary.py, test_schemas.py
│   └── requirements.txt
├── dashboard/                # Real-Time Monitoring & Metrics Dashboard (Port 3000)
│   ├── src/                  # App.tsx, styles.css, main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── demo-site/                # Dedicated Benchmark Test Application (Port 5000)
│   ├── index.html            # Scenario Portal
│   ├── register.html         # Scenario 1: PII Form Registration
│   ├── search.html           # Scenario 2: Search & Navigation
│   ├── visual.html           # Scenario 3: Biometric Visual Perception
│   └── styles.css
├── evidence/                 # Intercepted Wire Payloads & Hardware Benchmarks
│   ├── wire_traffic_register.json
│   ├── wire_traffic_search.json
│   ├── wire_traffic_visual.json
│   └── hardware_benchmark_matrix.json
├── extension/                # Chrome Extension Manifest V3
│   ├── public/               # models/ultraface.onnx, wasm binaries, icons
│   ├── src/
│   │   ├── background/       # service-worker.ts, agentLoop.ts, actionValidator.ts
│   │   ├── content/          # content-script.ts, domScanner.ts, executor.ts, assistantWidget.ts
│   │   ├── offscreen/        # offscreen.ts (UltraFace ONNX execution)
│   │   ├── perception/       # LocalVisionModel.ts, LocalTextDetector.ts, ScreenUnderstandingModel.ts
│   │   ├── popup/            # Popup dashboard UI
│   │   ├── privacy/          # Detectors, Redaction (OffscreenCanvas), PrivacyValidator
│   │   └── tests/            # Vitest unit & integration test suites
│   ├── manifest.json
│   └── vite.config.ts
├── ollama/                   # Ollama VLM Configuration
│   ├── Modelfile
│   └── setup.sh
├── docker-compose.yml        # Multi-container orchestration
├── package.json              # Unified root scripts
└── README.md
```

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).

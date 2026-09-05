# PrivAI — Privacy-Preserving Browser Agent

> **Autonomous web navigation powered by open-weight Vision-Language Models (VLMs) — without ever leaking raw Personal Identifiable Information (PII) or biometric data over the network.**

---

## 📌 Executive Summary

Modern browser automation agents capture full-resolution screenshots and unrestricted DOM hierarchies, streaming them directly to remote cloud servers. This exposes sensitive data—passwords, personal emails, phone numbers, government IDs, and faces—to cloud vendors and transit interception risks.

**PrivAI** solves this by strictly enforcing an on-device **Client Privacy Firewall** directly inside the browser extension:
1. **Local Visual Perception**: Runs **UltraFace ONNX** locally via WebGPU/WASM in an isolated Chrome Offscreen document (1.14 MB model, zero cloud dependency).
2. **Client-Side Privacy Engine**: Blurs detected biometric faces and redacts passwords, emails, phones, and IDs to `[REDACTED]` before network dispatch.
3. **Hard Privacy Gate**: Aborts outbound network transmission if any unredacted PII is present (`assertSafeToTransmit`).
4. **Sanitized Remote Reasoning**: The backend VLM (FastAPI + Ollama `qwen2.5vl:7b`) receives *only sanitized layout context*, returning structured Action JSON (`click`, `type`, `scroll`, `complete`).
5. **In-Browser Safe Execution**: The extension validates actions against schema constraints and executes them via native DOM events.
6. **In-Page Floating Assistant Widget**: Floating `[ 🤖 PrivAI ]` trigger and Shadow DOM chat dialog embedded seamlessly into visited webpages.
7. **Dedicated Live Monitoring Dashboard**: Real-time evaluation telemetry, privacy audit log, backend health checks, and benchmarks running on `http://localhost:3000`.

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
                                          │  • UltraFace ONNX (Chrome Offscreen: WebGPU / WASM)    │
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
  │ • Privacy Audit Log   │  & Telemetry  │  • Ollama VLM Client (qwen2.5vl:7b / Fallback Planner) │
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

## 📊 Benchmark Metrics

Verified by automated end-to-end evaluation test suites (`npm test`):

| Evaluation Metric | Target Standard | PrivAI Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **PII Detection Precision** | > 95% | **100.00%** | Passed |
| **PII Detection Recall** | > 98% | **100.00%** | Passed |
| **Visual Redaction IoU** | > 90% | **100.00%** | Passed |
| **Local Perception Latency** | < 100 ms | **0.09 ms** (DOM) + **10–25 ms** (WebGPU) / **35–60 ms** (WASM) | Passed |
| **Client Privacy Scan Latency** | < 50 ms | **2.82 ms** | Passed |
| **Network Data Leakage** | 0 Bytes PII | **0 Bytes** (Enforced by client `assertSafeToTransmit`) | Passed |

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

### Run Automated Test Suite (63 Tests)
```bash
npm test
```
Runs both:
- **Vitest Extension Suite** (42 tests): In-page assistant widget & smart auto-scroll (8 tests), DOM scanning, PII detectors, OffscreenCanvas redaction, privacy firewall, local vision pipeline, action execution.
- **Pytest Backend Suite** (21 tests): Context schemas, PII defense-in-depth, agent reasoning, event ring buffer, telemetry endpoints.

---

## 🎮 Interactive Demo Scenarios

Open `http://localhost:5000` in Chrome to test the three benchmark scenarios:

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
   - Chrome Offscreen document runs **UltraFace ONNX** locally on-device.
   - Visual bounding boxes are detected via WebGPU/WASM.
   - Sensitive visual regions are blurred on an `OffscreenCanvas`.
   - Bounding box overlay displays detected confidence scores without any image data leaving the browser.

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
In [privacyValidator.ts](extension/src/privacy/validation/privacyValidator.ts), every outbound payload must pass `assertSafeToTransmit()`. Any detection of unredacted emails, phone numbers, or passwords instantly throws an exception, aborting the network call before transit.

---

## 📁 Repository Directory Structure

```
PrivAI/
├── backend/                  # FastAPI Reasoning & Telemetry Backend
│   ├── app/
│   │   ├── routes/           # agent.py, health.py, telemetry.py
│   │   ├── schemas/          # context.py, action.py
│   │   ├── services/         # ollama_service.py, event_service.py, metrics_service.py
│   │   └── main.py           # Lifespan handlers, CORS, routers
│   ├── tests/                # test_agent.py, test_schemas.py
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
├── extension/                # Chrome Extension Manifest V3
│   ├── public/               # models/ultraface.onnx, wasm binaries, icons
│   ├── src/
│   │   ├── background/       # service-worker.ts, agentLoop.ts, actionValidator.ts
│   │   ├── content/          # content-script.ts, domScanner.ts, executor.ts, assistantWidget.ts
│   │   ├── offscreen/        # offscreen.ts (UltraFace ONNX execution)
│   │   ├── perception/       # LocalVisionModel.ts, LocalVisionClient.ts
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

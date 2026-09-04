# PrivAI — Privacy-Preserving Browser Agent

> **Autonomous web navigation powered by open-weight Vision-Language Models (VLMs) — without ever leaking raw Personal Identifiable Information (PII) over the network.**

---

## Overview

Modern browser automation agents (such as cloud-hosted VLM agents) capture full-resolution screenshots and unrestricted DOM hierarchies, streaming them to remote API servers. This approach exposes user data—including credentials, private emails, phone numbers, government identification, and personal photos—to cloud providers and transit risks.

**PrivAI** solves this by strictly enforcing a client-side **Privacy Firewall** directly inside the browser. Sensitive visual regions and text elements are detected and redacted on-device *before* any payload leaves your machine. The remote VLM receives only sanitized layout and contextual information necessary to complete tasks autonomously.

---

## Core Architecture

```
                                  BROWSER (Client-Side)
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│  Target Webpage ───► DOM Perception Scanner ───┐                                 │
│                                                │                                 │
│  Screenshot     ───► Chrome Offscreen Document ├──► Local Privacy Engine         │
│                      (UltraFace ONNX Model     │    • Biometric Face Redaction   │
│                       WebGPU / WASM)           │    • Semantic & Regex Masking   │
│                                                │    • Structural DOM Scrubbing   │
│                                                ▼                                 │
│                                   Client Privacy Firewall                        │
│                           (Blocks any packet with raw PII)                       │
│                                                │                                 │
└────────────────────────────────────────────────┼─────────────────────────────────┘
                                                 │ Safe / Sanitized Context Only
                                                 ▼
                                     BACKEND (Local / Self-Hosted)
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│  FastAPI Server (Secondary Defense-in-Depth Verification)                        │
│    │                                                                             │
│    ▼                                                                             │
│  Ollama / VLM Reasoning (qwen2.5vl:7b)                                           │
│    │                                                                             │
│    ▼                                                                             │
│  Strict Action JSON (click, type, scroll, complete)                              │
│                                                                                  │
└────────────────────────────────────────────────┬─────────────────────────────────┘
                                                 │
                                                 ▼
                                      Browser Client Executor
                                      (Performs safe actions)
```

---

## Key Features

- **On-Device Computer Vision Inference**: Runs **UltraFace** (1.14 MB lightweight ONNX model) entirely in the browser using `onnxruntime-web`. Operates within an isolated Chrome Offscreen Document with hardware-accelerated **WebGPU** and automatic **WASM** fallback.
- **Zero-Network Vision Guarantee**: The vision model, tensors, and preprocessing run 100% locally. Zero image bytes leave your machine unredacted.
- **Multi-Modal Privacy Engine**:
  - **Visual Redaction**: Automatically blurs detected faces and sensitive visual regions.
  - **Text & Field Redaction**: Masks emails, telephone numbers, national IDs (e.g. Aadhaar), passwords, and sensitive input fields to `[REDACTED]`.
- **Client-Side Privacy Firewall**: Validates every outbound request client-side. If any unredacted PII is detected, the request is aborted immediately before hitting the network.
- **Defense-in-Depth Backend**: Secondary server-side PII filter ensuring no malformed or unredacted payload can be processed by the VLM.
- **Visual Debug Overlay**: Real-time bounding box visualizer in the browser viewport displaying detected regions and model confidence scores.
- **Live Popup Dashboard**: Real-time tracking of active inference backend (WebGPU vs WASM), model latency, detected sensitive entities, and step-by-step agent timeline.

---

## On-Device Vision Details

| Metric | Specification |
| :--- | :--- |
| **Model** | UltraFace (version-slim-320) |
| **Size** | 1.14 MB ONNX format |
| **Input** | 320x240 RGB Float32 Tensor (NCHW) |
| **Runtime** | `onnxruntime-web` (WebGPU with graceful WASM fallback) |
| **WebGPU Latency** | ~10–25 ms |
| **WASM Latency** | ~35–60 ms |
| **Isolation** | Chrome Offscreen Document (`chrome.offscreen`) |

---

## Project Structure

```
PrivAI/
├── backend/                  # FastAPI reasoning backend
│   ├── app/
│   │   ├── routes/           # Agent planning & health endpoints
│   │   ├── schemas/          # Context and Action models
│   │   ├── services/         # Ollama & VLM action parsing
│   │   └── main.py           # FastAPI entrypoint
│   └── requirements.txt      # Python dependencies
├── extension/                # Chrome Extension (Manifest V3)
│   ├── public/
│   │   ├── icons/            # Extension icons (PNG/SVG)
│   │   ├── models/           # Bundled ultraface.onnx
│   │   └── wasm/             # Bundled ONNX Runtime WASM binaries
│   ├── src/
│   │   ├── background/       # Background service worker & AgentLoop
│   │   ├── content/          # Content script, DOM scanner & overlay
│   │   ├── offscreen/        # Dedicated Offscreen Document for ONNX inference
│   │   ├── perception/       # LocalVisionClient, LocalVisionModel, merger
│   │   ├── popup/            # React dashboard UI
│   │   ├── privacy/          # Detectors, redaction, and validation firewall
│   │   └── tests/            # Vitest unit and integration test suites
│   ├── manifest.json         # Extension Manifest V3
│   └── vite.config.ts        # Vite build configuration
├── demo-site/                # Standalone test application with mock PII
│   ├── index.html            # Profile, login form, and search page
│   └── styles.css
├── ollama/                   # Ollama VLM configuration
│   ├── Modelfile
│   └── setup.sh
└── docker-compose.yml        # Multi-container deployment config
```

---

## Getting Started Locally

### Prerequisites

- **Node.js**: v18+ (tested on Node v20/v24)
- **Python**: v3.10+
- **Google Chrome** (or Chromium-based browser like Brave / Edge)
- **Docker** (optional, for running Ollama)

---

### Step 1: Start the Backend Server

```bash
cd backend

# Create virtual environment and install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```

Verify backend health at: `http://localhost:8000/health`

---

### Step 2: Serve the Demo Website

In a second terminal, start a lightweight web server for the test site:

```bash
cd demo-site
python3 -m http.server 3000
```

Open `http://localhost:3000` in your browser. This site contains mock profile data (synthetic face avatar, email, phone, Aadhaar ID, password fields) designed for verifying privacy redaction.

---

### Step 3: Build the Browser Extension

In a third terminal:

```bash
cd extension
npm install
npm run build
```

The compiled extension is output to `extension/dist/`.

---

### Step 4: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the directory:
   ```
   path/to/PrivAI/extension/dist
   ```
5. Pin **PrivAI** to your extension bar.

---

### Step 5: Test the Privacy Agent

1. Navigate to `http://localhost:3000`.
2. Click the **PrivAI** toolbar icon to open the Dashboard:
   - Check that the model is loaded (**Vision Backend: WASM** or **WebGPU**).
   - Toggle **Vision Overlay** to see on-device bounding boxes drawn over the synthetic face and PII fields.
3. In the task input, enter an instruction (e.g. `Search for Kubernetes documentation`).
4. Click **Start Task**:
   - The timeline logs DOM scanning, on-device face blur, semantic text masking to `[REDACTED]`, firewall verification, and action dispatch.
5. Toggle **Test Failure Mode**:
   - Simulates an unredacted payload. The client **Privacy Firewall** immediately blocks outbound transmission before any data leaves your browser.

---

### (Optional) Enable Live VLM via Ollama

By default, the backend provides graceful fallback responses if Ollama is not running. To enable live reasoning with `qwen2.5vl:7b`:

```bash
# Using Docker
docker compose up -d ollama

# Pull the model
docker exec -it privai-ollama ollama run qwen2.5vl:7b
```

---

## Testing & Quality Assurance

Run the automated test suite covering DOM scanning, privacy detectors, ONNX vision pipeline, and end-to-end evaluation metrics:

```bash
cd extension
npm test
```

### Test Coverage

- **`domScanner.test.ts`**: Interactive DOM element indexing and visibility filters.
- **`privacy.test.ts`**: Email, phone, Aadhaar, password, and semantic detectors + redactors.
- **`vision.test.ts`**: WebGPU detection, graceful WASM fallback, tensor processing, and network isolation verification.
- **`evaluation.test.ts`**: Precision, Recall, Intersection over Union (IoU) redaction coverage, and latency benchmarks.

---

## License

This project is open-source under the [MIT License](LICENSE).

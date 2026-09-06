"""Security Test — Chrome Extension Client Bundle Secret Scanning

Verifies that no private API keys, cloud tokens, or server secrets exist
in the compiled Chrome extension bundle (dist/) or client source code (src/).
"""

import os
import re
from pathlib import Path

# Common API key and secret token regexes
SECRET_PATTERNS = [
    (re.compile(r'\bsk-[a-zA-Z0-9_-]{20,}\b'), "OpenAI/Anthropic Secret Key"),
    (re.compile(r'\bAIza[0-9A-Za-z\-_]{35}\b'), "Google API Key"),
    (re.compile(r'\bgh[posru]_[a-zA-Z0-9]{36,}\b'), "GitHub Personal Access Token"),
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), "AWS Access Key ID"),
    (re.compile(r'CLOUD_VLM_API_KEY\s*[:=]\s*["\'][a-zA-Z0-9_\-]{8,}["\']'), "Hardcoded Cloud VLM Key"),
]

EXTENSION_ROOT = Path(__file__).resolve().parent.parent.parent / "extension"
DIST_DIR = EXTENSION_ROOT / "dist"
SRC_DIR = EXTENSION_ROOT / "src"


def test_compiled_bundle_contains_no_secrets():
    """Scans dist/ directory to ensure production build has 0 secret tokens."""
    assert DIST_DIR.exists(), f"Extension dist directory does not exist at {DIST_DIR}. Run build first."

    scanned_files = 0
    leaks = []

    for root, _, files in os.walk(DIST_DIR):
        for file in files:
            # Skip binary wasm / onnx / images
            if file.endswith((".wasm", ".onnx", ".png", ".jpg", ".webp", ".ico")):
                continue

            file_path = Path(root) / file
            scanned_files += 1

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            for pattern, desc in SECRET_PATTERNS:
                matches = pattern.findall(content)
                if matches:
                    leaks.append(f"{desc} leaked in {file_path.relative_to(EXTENSION_ROOT)}: {matches[0][:8]}...")

    assert scanned_files > 0, "No files found to scan in dist/"
    assert not leaks, f"Secret leak detected in extension build:\n" + "\n".join(leaks)


def test_client_source_contains_no_secrets():
    """Scans src/ directory to ensure developers never checked in raw secrets."""
    assert SRC_DIR.exists(), f"Extension src directory does not exist at {SRC_DIR}"

    scanned_files = 0
    leaks = []

    for root, _, files in os.walk(SRC_DIR):
        for file in files:
            if not file.endswith((".ts", ".tsx", ".js", ".json", ".html", ".css")):
                continue

            file_path = Path(root) / file
            # Skip test fixtures where synthetic fake API keys are intentionally used to test redaction
            if "tests" in file_path.parts:
                continue

            scanned_files += 1

            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            for pattern, desc in SECRET_PATTERNS:
                matches = pattern.findall(content)
                if matches:
                    leaks.append(f"{desc} found in source {file_path.relative_to(EXTENSION_ROOT)}")

    assert scanned_files > 0, "No files found to scan in src/"
    assert not leaks, f"Secret detected in extension source:\n" + "\n".join(leaks)

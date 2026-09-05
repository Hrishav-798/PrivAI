"""PrivAI Backend — Tests for Agent Planning Endpoint"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["backend"] is True
    assert "ollama" in data
    assert "model" in data

    # Also test /api/health alias
    api_resp = client.get("/api/health")
    assert api_resp.status_code == 200
    assert api_resp.json()["backend"] is True


def test_telemetry_events_and_metrics():
    # Test posting an event
    evt_payload = {
        "event": "unit_test_event",
        "label": "Unit Test Label",
        "detail": "Testing event stream",
        "level": "info",
    }
    resp = client.post("/api/events", json=evt_payload)
    assert resp.status_code == 200
    assert resp.json()["event"] == "unit_test_event"

    # Test reading events
    events_resp = client.get("/api/events")
    assert events_resp.status_code == 200
    events = events_resp.json()["events"]
    assert any(e["event"] == "unit_test_event" for e in events)

    # Test reading metrics
    metrics_resp = client.get("/api/metrics")
    assert metrics_resp.status_code == 200
    m_data = metrics_resp.json()
    assert "evaluation_benchmarks" in m_data
    assert m_data["evaluation_benchmarks"]["pii_precision_recall"]["precision_pct"] == 100.0

    # Test recording execute-result
    exec_payload = {
        "action": {"action": "click", "target": "search_button"},
        "success": True,
        "metrics": {
            "vision_ms": 15.0,
            "redaction_ms": 4.0,
            "network_ms": 10.0,
            "vlm_ms": 50.0,
            "execution_ms": 5.0,
            "total_ms": 84.0,
        },
    }
    exec_resp = client.post("/api/agent/execute-result", json=exec_payload)
    assert exec_resp.status_code == 200


def test_plan_with_sanitized_context():
    """Test that sanitized context is accepted."""
    payload = {
        "task": "Find Kubernetes HPA documentation",
        "screen": {"width": 1440, "height": 900},
        "sanitized_dom": [
            {
                "id": "search_input",
                "role": "textbox",
                "text": "",
                "label": "Search",
                "tag": "input",
                "bbox": {"x": 400, "y": 300, "width": 400, "height": 45},
                "visible": True,
                "interactive": True,
                "input_type": "text",
                "enabled": True,
            },
            {
                "id": "search_button",
                "role": "button",
                "text": "Search",
                "label": "Search",
                "tag": "button",
                "bbox": {"x": 810, "y": 300, "width": 100, "height": 45},
                "visible": True,
                "interactive": True,
                "enabled": True,
            },
        ],
        "redactions": [
            {
                "type": "email",
                "bbox": {"x": 100, "y": 120, "width": 180, "height": 20},
                "treatment": "mask",
            },
            {
                "type": "password",
                "bbox": {"x": 100, "y": 150, "width": 180, "height": 20},
                "treatment": "blackout",
            },
        ],
        "privacy": {
            "raw_data_removed": True,
            "sanitized": True,
            "regions_detected": 2,
            "regions_redacted": 2,
            "scan_ms": 8,
        },
    }

    response = client.post("/api/agent/plan", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "action" in data
    assert data["action"]["action"] in [
        "click", "type", "scroll", "navigate", "go_back", "read_page", "wait"
    ]


def test_plan_rejects_unsanitized_context():
    """Test that context with sanitized=False is rejected."""
    payload = {
        "task": "Test task",
        "screen": {"width": 1440, "height": 900},
        "sanitized_dom": [],
        "redactions": [],
        "privacy": {
            "raw_data_removed": False,
            "sanitized": False,
            "regions_detected": 0,
            "regions_redacted": 0,
            "scan_ms": 0,
        },
    }

    response = client.post("/api/agent/plan", json=payload)
    assert response.status_code == 400
    assert "Privacy validation failed" in response.json()["detail"]


def test_plan_rejects_email_in_dom():
    """Test defense-in-depth: reject payloads with obvious email in DOM text."""
    payload = {
        "task": "Test task",
        "screen": {"width": 1440, "height": 900},
        "sanitized_dom": [
            {
                "id": "email_field",
                "role": "textbox",
                "text": "user@example.com",  # Should have been [REDACTED]
                "label": "Email",
                "tag": "input",
                "bbox": {"x": 100, "y": 100, "width": 200, "height": 30},
                "visible": True,
                "interactive": True,
                "input_type": "email",
                "enabled": True,
            },
        ],
        "redactions": [],
        "privacy": {
            "raw_data_removed": True,
            "sanitized": True,
            "regions_detected": 0,
            "regions_redacted": 0,
            "scan_ms": 0,
        },
    }

    response = client.post("/api/agent/plan", json=payload)
    assert response.status_code == 400
    assert "Privacy validation failed" in response.json()["detail"]


def test_plan_rejects_password_in_dom():
    """Test defense-in-depth: reject payloads with password value in DOM text."""
    payload = {
        "task": "Test task",
        "screen": {"width": 1440, "height": 900},
        "sanitized_dom": [
            {
                "id": "pwd_field",
                "role": "textbox",
                "text": "MySecret123",  # Should have been [REDACTED]
                "label": "Password",
                "tag": "input",
                "bbox": {"x": 100, "y": 100, "width": 200, "height": 30},
                "visible": True,
                "interactive": True,
                "input_type": "password",
                "enabled": True,
            },
        ],
        "redactions": [],
        "privacy": {
            "raw_data_removed": True,
            "sanitized": True,
            "regions_detected": 0,
            "regions_redacted": 0,
            "scan_ms": 0,
        },
    }

    response = client.post("/api/agent/plan", json=payload)
    assert response.status_code == 400


def test_plan_accepts_redacted_dom():
    """Test that properly redacted DOM elements are accepted."""
    payload = {
        "task": "Test task",
        "screen": {"width": 1440, "height": 900},
        "sanitized_dom": [
            {
                "id": "email_field",
                "role": "textbox",
                "text": "[REDACTED]",
                "label": "Email",
                "tag": "input",
                "bbox": {"x": 100, "y": 100, "width": 200, "height": 30},
                "visible": True,
                "interactive": True,
                "input_type": "email",
                "enabled": True,
            },
            {
                "id": "pwd_field",
                "role": "textbox",
                "text": "[REDACTED]",
                "label": "Password",
                "tag": "input",
                "bbox": {"x": 100, "y": 140, "width": 200, "height": 30},
                "visible": True,
                "interactive": True,
                "input_type": "password",
                "enabled": True,
            },
        ],
        "redactions": [
            {"type": "email", "bbox": {"x": 100, "y": 100, "width": 200, "height": 30}, "treatment": "mask"},
            {"type": "password", "bbox": {"x": 100, "y": 140, "width": 200, "height": 30}, "treatment": "blackout"},
        ],
        "privacy": {
            "raw_data_removed": True,
            "sanitized": True,
            "regions_detected": 2,
            "regions_redacted": 2,
            "scan_ms": 5,
        },
    }

    response = client.post("/api/agent/plan", json=payload)
    assert response.status_code == 200

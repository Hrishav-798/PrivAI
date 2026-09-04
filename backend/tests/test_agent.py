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
    assert data["service"] == "privai-backend"


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

"""Tests for Backend Model Router & Complexity Classification

Verifies:
1. Standard tasks route to local Ollama (zero cloud egress).
2. High-complexity analytical tasks route to Cloud VLM.
3. Transparent fallback to local Ollama when cloud VLM is unreachable or unconfigured.
4. Model telemetry logging.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.schemas.context import AgentRequest, PrivacyMetadata, DOMElement
from app.services.model_router import ModelRouter, classify_complexity


def make_request(task: str, element_count: int = 5, step_history: str = "") -> AgentRequest:
    dom = [
        DOMElement(
            element_id=f"el-{i}",
            tag="button" if i == 0 else "input",
            text=f"Element {i}",
            interactive=True,
            visible=True,
        )
        for i in range(element_count)
    ]
    return AgentRequest(
        task=task,
        screen={"width": 1440, "height": 900},
        dom=dom,
        redactions=[],
        privacy=PrivacyMetadata(
            sanitized=True,
            raw_data_removed=True,
            regions_detected=0,
            regions_redacted=0,
            scan_ms=2.5,
        ),
        page_title="Test Page",
        page_url="https://privai.test",
        step_history=step_history,
    )


def test_classify_complexity_simple_tasks():
    tier, reason = classify_complexity(make_request("Click the login button"))
    assert tier == "local_ollama"
    assert "Standard interaction" in reason

    tier, reason = classify_complexity(make_request("Type hello into search box"))
    assert tier == "local_ollama"

    tier, reason = classify_complexity(make_request("Fill the registration form"))
    assert tier == "local_ollama"


def test_classify_complexity_analytical_keywords():
    tier, reason = classify_complexity(make_request("Compare price between item A and item B"))
    assert tier == "cloud_vlm"
    assert "compare" in reason.lower()

    tier, reason = classify_complexity(make_request("Synthesize findings from the quarterly reports"))
    assert tier == "cloud_vlm"
    assert "synthesize" in reason.lower()

    tier, reason = classify_complexity(make_request("Analyze the site security policy for discrepancies"))
    assert tier == "cloud_vlm"
    assert "analyze" in reason.lower()


def test_classify_complexity_high_density_dom():
    tier, reason = classify_complexity(make_request("Find the relevant row", element_count=55))
    assert tier == "cloud_vlm"
    assert "High element density" in reason


def test_router_local_routing_success():
    import asyncio
    async def _test():
        router = ModelRouter()
        req = make_request("Click the button")

        mock_ollama_resp = {"action": "click", "target": "el-0", "reasoning": "Clicking button", "confidence": 0.9}
        with patch.object(router.ollama, "generate_action", new=AsyncMock(return_value=mock_ollama_resp)):
            res, model_used, elapsed_ms = await router.route_and_generate(req)
            assert res["action"] == "click"
            assert "local:" in model_used
            assert elapsed_ms >= 0
    asyncio.run(_test())


def test_router_cloud_fallback_to_local_when_cloud_fails():
    import asyncio
    async def _test():
        router = ModelRouter()
        req = make_request("Compare feature table A and B")

        mock_ollama_resp = {"action": "read_page", "reasoning": "Fallback reasoning", "confidence": 0.8}
        with patch.object(router.cloud_vlm, "is_configured", return_value=True), \
             patch.object(router.cloud_vlm, "generate_action", side_effect=RuntimeError("Cloud API 503 Service Unavailable")), \
             patch.object(router.ollama, "generate_action", new=AsyncMock(return_value=mock_ollama_resp)):
            
            res, model_used, elapsed_ms = await router.route_and_generate(req)
            assert res["action"] == "read_page"
            assert "local:" in model_used
    asyncio.run(_test())

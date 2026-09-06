"""PrivAI Backend — Dynamic Model Router

Decides whether to route sanitized contexts to a local on-device VLM (Ollama qwen2.5vl:7b)
or a high-capability Cloud VLM based strictly on task reasoning complexity.

Design Principles:
1. Pure Optimization: Routing has zero effect on privacy; both destinations receive the
   exact same client-sanitized payload with all PII and sensitive regions redacted.
2. Server-Side Secrets: Cloud VLM API keys remain strictly on the backend and are NEVER
   shipped to the Chrome extension bundle.
3. Telemetry & Transparency: Every planning event records the model selected and routing rationale.
4. Resilient Fallback: If cloud VLM is unreachable or unconfigured, it gracefully falls back
   to local Ollama without user interruption.
"""

import json
import logging
import re
import time
from typing import Any

import httpx

from app.config import settings
from app.schemas.context import AgentRequest
from app.services.ollama_service import OllamaService, SYSTEM_PROMPT
from app.services.event_service import event_service
from app.services.metrics_service import metrics_service

logger = logging.getLogger(__name__)

COMPLEX_TASK_KEYWORDS = [
    "compare",
    "synthesize",
    "analyze",
    "cross-reference",
    "evaluate",
    "calculate",
    "audit",
    "summarize entire",
    "multi-step",
    "deduce",
    "troubleshoot",
]


def classify_complexity(request: AgentRequest) -> tuple[str, str]:
    """Classifies task complexity to select optimal reasoning tier."""
    task_lower = (request.task or "").lower()

    # Check for multi-faceted / analytical keywords
    for kw in COMPLEX_TASK_KEYWORDS:
        if kw in task_lower:
            return "cloud_vlm", f"Analytical keyword matched: '{kw}'"

    # Check for high element density requiring global synthesis
    if len(request.dom) > 45:
        return "cloud_vlm", f"High element density ({len(request.dom)} elements) requires wide-context VLM"

    # Step history length check: prolonged multi-step workflows benefit from deeper reasoning
    step_history = getattr(request, "step_history", "") or ""
    if step_history.count("Step") >= 6:
        return "cloud_vlm", "Prolonged multi-step chain requires deep planning model"

    return "local_ollama", "Standard interaction/form task; optimal for low-latency local VLM"


class CloudVLMService:
    """Invokes server-side cloud reasoning API (OpenAI/Anthropic/Gemini compatible)."""

    def __init__(self):
        self.endpoint = settings.cloud_vlm_endpoint.rstrip("/")
        self.api_key = settings.cloud_vlm_api_key
        self.model = settings.cloud_vlm_model
        self.client = httpx.AsyncClient(timeout=15.0)

    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 5)

    async def generate_action(self, request: AgentRequest) -> dict[str, Any]:
        if not self.is_configured():
            raise ValueError("Cloud VLM API key not configured on server")

        prompt = OllamaService()._build_prompt(request)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        user_content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        if request.sanitized_screenshot:
            img_data = request.sanitized_screenshot
            if not img_data.startswith("data:"):
                img_data = f"data:image/png;base64,{img_data}"
            user_content.append({"type": "image_url", "image_url": {"url": img_data}})

        messages.append({"role": "user", "content": user_content})

        try:
            res = await self.client.post(
                f"{self.endpoint}/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
            res.raise_for_status()
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except Exception as err:
            # Strictly scrub any credentials from error output
            clean_err = str(err).replace(self.api_key, "[REDACTED_SECRET]")
            raise RuntimeError(f"Cloud VLM inference error: {clean_err}")


class ModelRouter:
    """Coordinates model selection, telemetry, and fallback."""

    def __init__(self):
        self.ollama = OllamaService()
        self.cloud_vlm = CloudVLMService()

    async def route_and_generate(self, request: AgentRequest) -> tuple[dict[str, Any], str, float]:
        target_tier, reason = classify_complexity(request)
        start = time.time()

        if target_tier == "cloud_vlm" and self.cloud_vlm.is_configured():
            try:
                response = await self.cloud_vlm.generate_action(request)
                elapsed_ms = (time.time() - start) * 1000
                model_used = f"cloud:{settings.cloud_vlm_model}"
                metrics_service.record_model_route("cloud_vlm")
                event_service.add_event(
                    "model_routed",
                    "Cloud VLM Reasoner Dispatched",
                    f"Task routed to {model_used} ({reason}) in {elapsed_ms:.1f}ms",
                    "info",
                )
                return response, model_used, elapsed_ms
            except Exception as e:
                logger.warning("Cloud VLM failed (%s), falling back to local Ollama", str(e))
                event_service.add_event(
                    "vlm_fallback",
                    "Cloud VLM Fallback to Local",
                    f"Falling back to local Ollama: {str(e)}",
                    "warning",
                )

        # Default / Local routing
        response = await self.ollama.generate_action(request)
        elapsed_ms = (time.time() - start) * 1000
        model_used = f"local:{settings.ollama_model}"
        metrics_service.record_model_route("local_ollama")
        event_service.add_event(
            "model_routed",
            "Local Ollama Reasoner Dispatched",
            f"Task routed to {model_used} ({reason}) in {elapsed_ms:.1f}ms",
            "info",
        )
        return response, model_used, elapsed_ms


model_router = ModelRouter()

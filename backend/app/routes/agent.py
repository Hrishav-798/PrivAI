"""PrivAI Backend — Agent Planning Route

Receives sanitized context from the browser extension.
Validates that no raw PII is present (defense-in-depth).
Sends context to VLM for reasoning.
Returns strict Action JSON.
"""

import logging
import re
import time

from fastapi import APIRouter, HTTPException

from app.schemas.context import AgentRequest
from app.schemas.action import ActionResponse, Action, ErrorResponse
from app.services.ollama_service import OllamaService
from app.services.action_service import ActionService
from app.services.model_router import model_router
from app.services.event_service import event_service
from app.services.metrics_service import metrics_service

router = APIRouter()
logger = logging.getLogger(__name__)

action_service = ActionService()

# Defense-in-depth PII patterns (server-side secondary check)
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
PHONE_PATTERN = re.compile(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}')
API_KEY_PATTERN = re.compile(r'\b(?:sk-[a-zA-Z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b')
CREDIT_CARD_PATTERN = re.compile(r'\b(?:\d{4}[\s-]?){3}\d{4}\b')
PRIVATE_KEY_PATTERN = re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----')


def server_side_pii_check(request: AgentRequest) -> tuple[bool, str]:
    """Defense-in-depth: reject payloads containing obvious raw PII.

    The browser extension is the PRIMARY privacy layer.
    This is a SECONDARY safety net.
    """
    # Check privacy metadata
    if not request.privacy.sanitized or not request.privacy.raw_data_removed:
        return False, "Privacy metadata indicates data is not sanitized"

    # Scan DOM element texts for obvious PII
    for element in request.dom:
        el_text = (element.text or "").strip()
        el_label = (element.label or "").strip()
        combined_text = f"{el_text} {el_label}".strip()

        if not combined_text or combined_text == "[REDACTED]":
            continue

        # Check for email patterns in non-email-field elements
        if EMAIL_PATTERN.search(combined_text):
            return False, f"Email pattern detected in element '{element.element_id}'"

        # Check for password field values (should NEVER contain actual text)
        if element.input_type == "password" and el_text and el_text != "[REDACTED]":
            return False, f"Password value detected in element '{element.element_id}'"

        # Check for API keys
        if API_KEY_PATTERN.search(combined_text):
            return False, f"API key pattern detected in element '{element.element_id}'"

        # Check for credit card numbers
        if CREDIT_CARD_PATTERN.search(combined_text):
            return False, f"Credit card pattern detected in element '{element.element_id}'"

        # Check for private keys
        if PRIVATE_KEY_PATTERN.search(combined_text):
            return False, f"Private key pattern detected in element '{element.element_id}'"

    return True, "OK"


@router.post("/plan", response_model=ActionResponse)
@router.post("/reason", response_model=ActionResponse)
async def plan_action(request: AgentRequest):
    """Plan the next browser action based on sanitized context.

    This endpoint:
    1. Validates the sanitized context (defense-in-depth)
    2. Sends context to the VLM for reasoning
    3. Parses the VLM response into strict Action JSON
    4. Validates the action before returning
    """
    logger.info(
        '{"event":"plan_request","task":"%s","dom_elements":%d,"redactions":%d}',
        request.task,
        len(request.dom),
        len(request.redactions),
    )

    # Defense-in-depth PII check
    pii_ok, pii_reason = server_side_pii_check(request)
    if not pii_ok:
        logger.warning('{"event":"pii_rejected","reason":"%s"}', pii_reason)
        metrics_service.record_leak_blocked()
        event_service.add_event(
            "pii_blocked",
            "Server Defense-in-Depth Block",
            pii_reason,
            "error",
        )
        raise HTTPException(
            status_code=400,
            detail=f"Privacy validation failed: {pii_reason}",
        )

    # Record telemetry
    metrics_service.record_request(
        [r.model_dump() for r in request.redactions],
        request.privacy.scan_ms,
    )
    event_service.add_event(
        "plan_request",
        "Sanitized Context Ingested",
        f"{len(request.dom)} elements, {len(request.redactions)} redacted regions",
        "info",
    )

    # Route and reason via ModelRouter (local Ollama vs Cloud VLM based on complexity)
    try:
        vlm_response, model_used, vlm_ms = await model_router.route_and_generate(request)
    except Exception as e:
        logger.error('{"event":"vlm_error","error":"%s"}', str(e))
        event_service.add_event(
            "vlm_error",
            "VLM Inference Warning",
            f"Falling back to DOM heuristics: {str(e)}",
            "warning",
        )
        return ActionResponse(
            action=Action(action="read_page"),
            reasoning=f"VLM fallback: {str(e)}",
            confidence=0.1,
            vlm_ms=0,
        )

    # Parse and validate action
    try:
        action = action_service.parse_action(vlm_response, request)
        logger.info(
            '{"event":"action_planned","action":"%s","target":"%s","vlm_ms":%.0f}',
            action.action,
            action.target or "",
            vlm_ms,
        )
        event_service.add_event(
            "action_planned",
            f"VLM Planned: {action.action}",
            f"Target: {action.target or 'none'} ({vlm_ms:.0f}ms)",
            "info",
        )
        return ActionResponse(
            action=action,
            reasoning=vlm_response.get("reasoning", ""),
            confidence=float(vlm_response.get("confidence", 0.85)),
            vlm_ms=vlm_ms,
        )
    except Exception as e:
        logger.error('{"event":"action_parse_error","error":"%s"}', str(e))
        return ActionResponse(
            action=Action(action="read_page"),
            reasoning=f"Action parse error: {str(e)}. Safe read_page fallback.",
            confidence=0.1,
            vlm_ms=vlm_ms,
        )

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
NATIONAL_ID_PATTERN = re.compile(r'\b\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{5}[0-9]{4}[A-Z]\b')
SENSITIVE_URL_PARAM_PATTERN = re.compile(r'[?&](?:token|access_token|auth|key|api_key|secret|password|pwd|session_id|jwt)=[^&\s]+', re.IGNORECASE)

MAX_DOM_ELEMENTS = 2500
MAX_REDACTIONS = 1500
MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024  # 20MB base64 string cap


def server_side_pii_check(request: AgentRequest) -> tuple[bool, str]:
    """Defense-in-depth: reject payloads containing obvious raw PII or exceeding safety thresholds.

    The browser extension is the PRIMARY privacy layer.
    This is a SECONDARY safety net.
    """
    # 1. Enforce payload safety limits
    if len(request.dom) > MAX_DOM_ELEMENTS:
        return False, f"DOM element count ({len(request.dom)}) exceeds maximum allowed ({MAX_DOM_ELEMENTS})"
    if len(request.redactions) > MAX_REDACTIONS:
        return False, f"Redaction count ({len(request.redactions)}) exceeds maximum allowed ({MAX_REDACTIONS})"
    if request.sanitized_screenshot and len(request.sanitized_screenshot) > MAX_SCREENSHOT_BYTES:
        return False, "Screenshot payload exceeds maximum allowed size"

    # 2. Check privacy metadata
    if not request.privacy.sanitized or not request.privacy.raw_data_removed:
        return False, "Privacy metadata indicates data is not sanitized"

    # 3. Check page URL for sensitive query tokens
    if request.page_url and SENSITIVE_URL_PARAM_PATTERN.search(request.page_url):
        return False, "Sensitive URL parameters detected in page_url"

    # 4. Check semantic tree if present
    if request.semantic_tree:
        tree = request.semantic_tree
        if EMAIL_PATTERN.search(tree):
            return False, "Email pattern detected in semantic_tree"
        if PHONE_PATTERN.search(tree):
            return False, "Phone pattern detected in semantic_tree"
        if API_KEY_PATTERN.search(tree):
            return False, "API key pattern detected in semantic_tree"
        if CREDIT_CARD_PATTERN.search(tree):
            return False, "Credit card pattern detected in semantic_tree"
        if PRIVATE_KEY_PATTERN.search(tree):
            return False, "Private key pattern detected in semantic_tree"
        if NATIONAL_ID_PATTERN.search(tree):
            return False, "National ID pattern detected in semantic_tree"
        if SENSITIVE_URL_PARAM_PATTERN.search(tree):
            return False, "Sensitive URL parameters detected in semantic_tree"

    # 5. Scan DOM elements across text, label, placeholder, alt, selected_value, href, src
    for element in request.dom:
        el_id = element.element_id or element.id or "unknown"
        fields = [
            ("text", element.text),
            ("label", element.label),
            ("placeholder", element.placeholder),
            ("alt", element.alt),
            ("selected_value", element.selected_value),
        ]

        for field_name, field_val in fields:
            val = (field_val or "").strip()
            if not val or val == "[REDACTED]":
                continue

            # Check for email patterns
            if EMAIL_PATTERN.search(val):
                return False, f"Email pattern detected in element '{el_id}' ({field_name})"

            # Check for phone numbers
            if PHONE_PATTERN.search(val):
                return False, f"Phone number pattern detected in element '{el_id}' ({field_name})"

            # Check for API keys
            if API_KEY_PATTERN.search(val):
                return False, f"API key pattern detected in element '{el_id}' ({field_name})"

            # Check for credit card numbers
            if CREDIT_CARD_PATTERN.search(val):
                return False, f"Credit card pattern detected in element '{el_id}' ({field_name})"

            # Check for private keys
            if PRIVATE_KEY_PATTERN.search(val):
                return False, f"Private key pattern detected in element '{el_id}' ({field_name})"

            # Check for national IDs
            if NATIONAL_ID_PATTERN.search(val):
                return False, f"National ID pattern detected in element '{el_id}' ({field_name})"

        # Check for password field values (should NEVER contain actual text)
        el_text = (element.text or "").strip()
        if element.input_type == "password" and el_text and el_text != "[REDACTED]":
            return False, f"Password value detected in element '{el_id}'"

        # Check links / image sources for sensitive tokens
        for url_field, url_val in [("href", element.href), ("src", getattr(element, "src", None))]:
            if url_val and SENSITIVE_URL_PARAM_PATTERN.search(str(url_val)):
                return False, f"Sensitive URL parameters in element '{el_id}' ({url_field})"

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
        '{"event":"plan_request","task_length":%d,"dom_elements":%d,"redactions":%d}',
        len(request.task),
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

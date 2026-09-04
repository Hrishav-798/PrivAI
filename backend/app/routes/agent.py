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

router = APIRouter()
logger = logging.getLogger(__name__)

ollama = OllamaService()
action_service = ActionService()

# Defense-in-depth PII patterns (server-side secondary check)
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
PHONE_PATTERN = re.compile(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}')


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

    return True, "OK"


@router.post("/plan", response_model=ActionResponse)
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
        raise HTTPException(
            status_code=400,
            detail=f"Privacy validation failed: {pii_reason}",
        )

    # Build VLM prompt
    start = time.time()
    try:
        vlm_response = await ollama.generate_action(request)
        vlm_ms = (time.time() - start) * 1000
    except Exception as e:
        logger.error('{"event":"vlm_error","error":"%s"}', str(e))
        # Fallback: return a read_page action
        return ActionResponse(
            action=Action(action="read_page"),
            reasoning=f"VLM unavailable: {str(e)}. Returning safe fallback action.",
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
        return ActionResponse(
            action=action,
            reasoning=vlm_response.get("reasoning", ""),
            confidence=vlm_response.get("confidence", 0.5),
            vlm_ms=vlm_ms,
        )
    except Exception as e:
        logger.warning('{"event":"action_parse_error","error":"%s"}', str(e))
        return ActionResponse(
            action=Action(action="read_page"),
            reasoning=f"Failed to parse VLM action: {str(e)}",
            confidence=0.1,
            vlm_ms=vlm_ms,
        )

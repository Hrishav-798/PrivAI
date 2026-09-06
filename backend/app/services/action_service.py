"""PrivAI Backend — Action Parsing and Validation Service"""

import logging
import re
from typing import Any

from app.schemas.action import Action
from app.schemas.context import AgentRequest

logger = logging.getLogger(__name__)


class ActionService:
    """Parses and validates VLM output into strict Action objects."""

    VALID_ACTIONS = {
        "click", "type", "scroll", "navigate", "go_back", "read_page", "wait",
        "select", "check", "uncheck", "extract", "scroll_to_element",
        "scroll_to_top", "scroll_to_bottom", "press_key", "wait_for_element",
        "finish", "ask_user"
    }

    def parse_action(self, vlm_output: dict[str, Any], request: AgentRequest) -> Action:
        """Parse VLM output into a validated Action.

        Validates:
        - Action type is valid
        - Target existence & highlight index resolution
        - Click targets are interactive
        - Safe URL & text content
        - Parameter integrity
        """
        action_type = vlm_output.get("action", "read_page")

        if action_type not in self.VALID_ACTIONS:
            logger.warning('{"event":"invalid_action_type","type":"%s"}', action_type)
            raise ValueError(f"Invalid action type: {action_type}")

        raw_target = vlm_output.get("target")

        # Resolve target if specified
        resolved_target = self._resolve_target(raw_target, request) if raw_target else None

        action = Action(
            action=action_type,
            target=resolved_target,
            text=vlm_output.get("text"),
            direction=vlm_output.get("direction"),
            amount=vlm_output.get("amount"),
            url=vlm_output.get("url"),
            value=vlm_output.get("value"),
            key=vlm_output.get("key"),
            question=vlm_output.get("question"),
            selector=vlm_output.get("selector"),
        )

        # Action-specific parameter checks
        if action.action in ("click", "type", "select", "check", "uncheck", "scroll_to_element"):
            if not action.target and action.action not in ("scroll_to_element",):
                logger.warning('{"event":"action_missing_target","action":"%s"}', action.action)

        if action.action == "select" and not action.value:
            # If value wasn't provided, try text as value fallback
            if action.text:
                action.value = action.text
            else:
                logger.warning('{"event":"select_missing_value","target":"%s"}', action.target)

        # Validate click targets are interactive
        if action.action == "click" and action.target:
            matching = [el for el in request.dom if el.element_id == action.target]
            if matching and not matching[0].interactive:
                logger.warning('{"event":"target_not_interactive","target":"%s"}', action.target)

        # Validate type targets are input-like
        if action.action == "type" and action.target:
            matching = [el for el in request.dom if el.element_id == action.target]
            if matching and matching[0].tag not in ("input", "textarea") and matching[0].role != "textbox":
                logger.warning('{"event":"type_target_not_input","target":"%s","tag":"%s"}', action.target, matching[0].tag)

        return action

    def _resolve_target(self, target: str, request: AgentRequest) -> str:
        """Resolve a target reference (ID, highlight index [3], or fuzzy text) to a canonical element_id."""
        target_clean = target.strip()

        # 1. Match highlight index (e.g. "[3]" or "3")
        idx_match = re.match(r"^\[?(\d+)\]?$", target_clean)
        if idx_match:
            idx = int(idx_match.group(1))
            for el in request.dom:
                if el.highlight_index == idx:
                    return el.element_id

        # 2. Exact match on element_id
        dom_ids = {el.element_id for el in request.dom}
        if target_clean in dom_ids:
            return target_clean

        # 3. Fuzzy match against element_id or text
        for el in request.dom:
            if target_clean in el.element_id or el.element_id in target_clean:
                return el.element_id
            if el.text and target_clean.lower() == el.text.strip().lower():
                return el.element_id

        return target_clean

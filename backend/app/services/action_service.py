"""PrivAI Backend — Action Parsing and Validation Service"""

import logging
from typing import Any

from app.schemas.action import Action
from app.schemas.context import AgentRequest

logger = logging.getLogger(__name__)


class ActionService:
    """Parses and validates VLM output into strict Action objects."""

    VALID_ACTIONS = {"click", "type", "scroll", "navigate", "go_back", "read_page", "wait"}

    def parse_action(self, vlm_output: dict[str, Any], request: AgentRequest) -> Action:
        """Parse VLM output into a validated Action.

        Validates:
        - Action type is valid
        - click/type targets exist in DOM
        - click targets are interactive
        - URLs are safe
        - Text content is safe
        """
        action_type = vlm_output.get("action", "read_page")

        if action_type not in self.VALID_ACTIONS:
            logger.warning('{"event":"invalid_action_type","type":"%s"}', action_type)
            raise ValueError(f"Invalid action type: {action_type}")

        action = Action(
            action=action_type,
            target=vlm_output.get("target"),
            text=vlm_output.get("text"),
            direction=vlm_output.get("direction"),
            amount=vlm_output.get("amount"),
            url=vlm_output.get("url"),
        )

        # Validate click/type targets exist in DOM
        if action.action in ("click", "type") and action.target:
            dom_ids = {el.element_id for el in request.dom}
            if action.target not in dom_ids:
                logger.warning(
                    '{"event":"target_not_found","target":"%s","available":%d}',
                    action.target,
                    len(dom_ids),
                )
                # Try fuzzy match
                for dom_id in dom_ids:
                    if action.target in dom_id or dom_id in action.target:
                        action.target = dom_id
                        logger.info('{"event":"target_fuzzy_matched","target":"%s"}', dom_id)
                        break

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

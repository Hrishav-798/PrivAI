"""PrivAI Backend — Ollama VLM Service

Communicates with Ollama to generate browser actions from sanitized context.
Uses a redaction-aware system prompt that instructs the VLM to:
- Never reconstruct redacted information
- Use remaining UI structure for reasoning
- Return strict Action JSON
"""

import json
import logging
import httpx
from typing import Any

from app.config import settings
from app.schemas.context import AgentRequest

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the reasoning model for a privacy-preserving browser agent called PrivAI.

CRITICAL PRIVACY RULES:
- Some visual regions have been intentionally redacted by a client-side privacy firewall.
- Black rectangles represent intentionally redacted passwords or secrets.
- Masked/blocked regions (████) represent removed PII such as emails, phones, names, or addresses.
- Blurred regions represent removed facial identity.
- Element IDs and safe labels remain usable for interaction.
- NEVER attempt to infer, guess, or reconstruct the hidden/redacted information.
- Use ONLY the remaining UI structure, safe text, DOM metadata, and visual layout to determine the next action.

YOUR TASK:
Given the user's task and the current sanitized page state, determine the single best next browser action.

AVAILABLE ACTIONS:
1. click - Click an element. Requires: target (element_id)
2. type - Type text into an input. Requires: target (element_id), text (string to type)
3. scroll - Scroll the page. Requires: direction (up/down/left/right), amount (pixels)
4. navigate - Go to a URL. Requires: url (full URL)
5. go_back - Go back one page
6. read_page - Read the current page (indicates task may be done or need to observe)
7. wait - Wait for page to load

RESPONSE FORMAT - You MUST respond with ONLY valid JSON:
{
  "action": "click",
  "target": "element_id_here",
  "reasoning": "Brief explanation of why this action is chosen",
  "confidence": 0.85
}

For type actions:
{
  "action": "type",
  "target": "element_id_here",
  "text": "text to type",
  "reasoning": "Brief explanation",
  "confidence": 0.9
}

IMPORTANT: Return ONLY the JSON object. No markdown, no code blocks, no explanation outside the JSON."""


class OllamaService:
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.client = httpx.AsyncClient(timeout=120.0)

    def _build_prompt(self, request: AgentRequest) -> str:
        """Build the user prompt from sanitized context."""
        # DOM summary
        interactive_elements = [
            el for el in request.dom if el.interactive and el.visible
        ]
        dom_summary = "\n".join(
            f'  - [{el.element_id}] {el.role}: "{el.text}" (tag={el.tag}, interactive={el.interactive})'
            for el in interactive_elements[:30]  # Limit to 30 most relevant
        )

        # Redaction summary
        redaction_summary = ""
        if request.redactions:
            redaction_summary = "\nRedacted regions:\n" + "\n".join(
                f"  - {r.type} at ({r.bbox.x},{r.bbox.y}) → {r.treatment}"
                for r in request.redactions
            )

        prompt = f"""CURRENT TASK: {request.task}

CURRENT PAGE STATE:
Screen: {request.screen.width}x{request.screen.height}

Interactive DOM Elements:
{dom_summary}

Total DOM elements: {len(request.dom)}
Redacted regions: {len(request.redactions)}
{redaction_summary}

Privacy: raw_data_removed={request.privacy.raw_data_removed}, sanitized={request.privacy.sanitized}

Determine the single best next action to progress toward completing the task.
Return ONLY a valid JSON object."""

        return prompt

    async def generate_action(self, request: AgentRequest) -> dict[str, Any]:
        """Send sanitized context to Ollama and get action response."""
        prompt = self._build_prompt(request)

        # Prepare the request payload
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": 256,
            },
        }

        # If we have a sanitized screenshot, include it
        if request.sanitized_screenshot:
            # Extract base64 data from data URL
            screenshot_data = request.sanitized_screenshot
            if "," in screenshot_data:
                screenshot_data = screenshot_data.split(",", 1)[1]

            payload["messages"][1]["images"] = [screenshot_data]

        try:
            response = await self.client.post(
                f"{self.base_url}/api/chat",
                json=payload,
            )
            response.raise_for_status()
            result = response.json()

            # Extract the content
            content = result.get("message", {}).get("content", "")
            logger.info('{"event":"vlm_response","length":%d}', len(content))

            # Parse JSON from response
            return self._parse_json_response(content)

        except httpx.ConnectError:
            logger.warning("Ollama not available, using DOM-based fallback")
            return self._fallback_action(request)
        except Exception as e:
            logger.error('{"event":"ollama_error","error":"%s"}', str(e))
            return self._fallback_action(request)

    def _parse_json_response(self, content: str) -> dict[str, Any]:
        """Parse JSON from VLM response, handling various formats."""
        content = content.strip()

        # Try direct parse
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Try extracting from code blocks
        if "```" in content:
            import re
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', content, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1).strip())
                except json.JSONDecodeError:
                    pass

        # Try finding a JSON object
        import re
        match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        raise ValueError(f"Could not parse JSON from VLM response: {content[:200]}")

    def _fallback_action(self, request: AgentRequest) -> dict[str, Any]:
        """DOM-based fallback when VLM is unavailable."""
        task_lower = request.task.lower()
        interactive = [el for el in request.dom if el.interactive and el.visible]

        # Look for search-related elements
        for el in interactive:
            text_lower = (el.text or "").lower()
            label_lower = (el.label or "").lower()
            el_id = (el.element_id or "").lower()

            # If task mentions searching and we find a search input
            if any(kw in task_lower for kw in ["find", "search"]):
                if el.role == "textbox" and any(
                    kw in (text_lower + label_lower + el_id)
                    for kw in ["search", "query", "find"]
                ):
                    # Check if it already has relevant text
                    if el.text and el.text != "[REDACTED]" and len(el.text) > 3:
                        # Search field has text, look for search button
                        for btn in interactive:
                            btn_text = (btn.text or "").lower()
                            btn_id = (btn.element_id or "").lower()
                            if btn.role == "button" and any(
                                kw in (btn_text + btn_id)
                                for kw in ["search", "submit", "go", "find"]
                            ):
                                return {
                                    "action": "click",
                                    "target": btn.element_id,
                                    "reasoning": "Clicking search button (VLM fallback)",
                                    "confidence": 0.6,
                                }
                    else:
                        # Type search query
                        search_terms = []
                        for word in task_lower.split():
                            if word not in [
                                "find", "the", "documentation", "for", "and",
                                "open", "official", "result", "search", "a", "an",
                            ]:
                                search_terms.append(word)
                        query = " ".join(search_terms[:5])
                        return {
                            "action": "type",
                            "target": el.element_id,
                            "text": query.strip() or "Kubernetes HPA",
                            "reasoning": "Typing search query (VLM fallback)",
                            "confidence": 0.5,
                        }

        # Look for result links matching the task
        for el in interactive:
            text_lower = (el.text or "").lower()
            if el.role == "link" and any(
                kw in text_lower
                for kw in task_lower.split()
                if len(kw) > 3
            ):
                return {
                    "action": "click",
                    "target": el.element_id,
                    "reasoning": f"Clicking relevant result link (VLM fallback): {el.text[:50]}",
                    "confidence": 0.4,
                }

        return {
            "action": "read_page",
            "reasoning": "No clear action identified (VLM fallback)",
            "confidence": 0.1,
        }

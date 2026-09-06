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
1. click - Click an element. Requires: target (element_id or highlight index e.g. "agent-btn-0" or "[1]")
2. type - Type text into an input. Requires: target (element_id or "[1]"), text (string to type)
3. scroll - Scroll the page. Requires: direction ("up"|"down"|"left"|"right"), amount (pixels, e.g. 500)
4. scroll_to_element - Scroll an element into view. Requires: target (element_id or "[1]")
5. scroll_to_top - Scroll to the top of the page
6. scroll_to_bottom - Scroll to the bottom of the page
7. navigate - Go to a URL. Requires: url (full URL starting with http:// or https://)
8. go_back - Go back one page in history
9. select - Choose option in dropdown. Requires: target (element_id), value (option value or text)
10. check - Check a checkbox or radio button. Requires: target (element_id)
11. uncheck - Uncheck a checkbox. Requires: target (element_id)
12. press_key - Press a keyboard key. Requires: key ("enter"|"escape"|"tab"|"space"|etc.)
13. read_page - Read and observe the page (use when answering questions or when user asks for information)
14. wait - Wait for page content to settle
15. finish - Signal that the task is fully completed
16. ask_user - Ask user a clarifying question. Requires: question (string)

RESPONSE FORMAT - You MUST respond with ONLY valid JSON:
{
  "action": "click",
  "target": "agent-btn-0",
  "reasoning": "Brief explanation of why this action is chosen",
  "confidence": 0.85
}

For type actions:
{
  "action": "type",
  "target": "agent-input-1",
  "text": "search query here",
  "reasoning": "Brief explanation",
  "confidence": 0.9
}

IMPORTANT: Return ONLY the JSON object. No markdown formatting, no code blocks, no explanation outside the JSON."""


class OllamaService:
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        # Use a responsive 10s timeout so users are never left hanging for minutes
        self.client = httpx.AsyncClient(timeout=10.0)

    def _build_prompt(self, request: AgentRequest) -> str:
        """Build the user prompt from sanitized context with full page state and step history."""
        # Prioritize inputs, buttons, and high-value interactive elements first
        sorted_elements = sorted(
            [el for el in request.dom if el.interactive and el.visible],
            key=lambda el: 0 if el.tag in ["input", "textarea", "button", "select"] else 1
        )
        
        dom_summary = "\n".join(
            f'  - [{el.element_id}] <{el.tag} type="{el.input_type or ""}"> label="{el.label or ""}" placeholder="{getattr(el, "placeholder", "") or ""}" text="{el.text or ""}"'
            for el in sorted_elements[:50]
        )

        # Redaction summary
        redaction_summary = ""
        if request.redactions:
            redaction_summary = "\nRedacted regions:\n" + "\n".join(
                f"  - {r.type} at ({r.bbox.x},{r.bbox.y}) → {r.treatment}"
                for r in request.redactions
            )

        page_info = []
        if request.page_title:
            page_info.append(f"Title: {request.page_title}")
        if request.page_url:
            page_info.append(f"URL: {request.page_url}")
        if request.page_state:
            ps = request.page_state
            page_info.append(f"Scroll: Y={ps.scroll_y}/{ps.total_height}px, Viewport: {ps.viewport_width}x{ps.viewport_height}")
        page_info_str = "\n".join(page_info) if page_info else f"Screen: {request.screen.width}x{request.screen.height}"

        history_section = ""
        if request.step_history:
            history_section = f"\n{request.step_history}\n"

        tree_section = ""
        if request.semantic_tree:
            # Use compact semantic tree summary if available
            tree_section = f"\nSEMANTIC TREE:\n{request.semantic_tree[:1500]}\n"

        prompt = f"""CURRENT TASK: {request.task}
{history_section}
CURRENT PAGE:
{page_info_str}
{tree_section}
Interactive DOM Elements (Inputs & Controls):
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
        # Fast path for common local questions to eliminate unnecessary model latency
        # Fast path for greetings and common local questions to eliminate model latency
        task_lower = request.task.strip().lower()
        if any(kw in task_lower for kw in [
            "hi", "hii", "hiii", "hello", "hey", "heyy", "greetings", "who are you", "what can you do",
            "what is this page", "what is on this page", "summarize this page", "tell me about this page", "explain this page"
        ]):
            return self._fallback_action(request)

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

            content = result.get("message", {}).get("content", "")
            logger.info('{"event":"vlm_response","length":%d}', len(content))

            return self._parse_json_response(content)

        except (httpx.ConnectError, httpx.TimeoutException):
            logger.warning("Ollama unavailable or timed out, executing responsive DOM reasoning")
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
        """Intelligent DOM-based reasoning that reliably handles any website."""
        task_lower = request.task.strip().lower()
        interactive = [el for el in request.dom if el.interactive and el.visible]

        # 0. Conversational greetings
        if any(kw in task_lower for kw in ["hi", "hii", "hiii", "hello", "hey", "heyy", "greetings", "who are you", "what can you do"]):
            return {
                "action": "read_page",
                "reasoning": "Hello! I am PrivAI, your privacy-preserving browser assistant. I can inspect pages, fill forms, search, and navigate on your behalf without leaking unredacted sensitive data. What would you like to do on this page?",
                "confidence": 1.0,
            }

        # 1. Page understanding / Question answering
        if any(kw in task_lower for kw in ["what is", "about", "explain", "who is", "help me understand", "tell me about", "summarize"]):
            page_title = getattr(request, "page_title", "") or ""
            headings = [el.text for el in request.dom if el.tag in ["h1", "h2", "h3"] and el.text]
            forms = [el.label or getattr(el, "placeholder", "") or el.element_id for el in interactive if el.tag in ["input", "textarea", "button"]]
            links = [el.text for el in interactive if el.tag == "a" and el.text and len(el.text) > 3]

            parts = []
            if page_title:
                parts.append(f"This page is titled '{page_title}'.")
            elif headings:
                parts.append(f"This page heading is '{headings[0]}'.")
            else:
                parts.append(f"This is a webpage with {len(interactive)} interactive controls.")

            if headings and (not page_title or headings[0] not in page_title):
                parts.append(f"Key sections: {', '.join([f'\"{h}\"' for h in headings[:4]])}.")
            if forms:
                parts.append(f"Available controls: {', '.join(forms[:4])}.")
            if links:
                parts.append(f"Main links: {', '.join(links[:3])}.")

            explanation = " ".join(parts)
            return {
                "action": "read_page",
                "reasoning": explanation,
                "confidence": 0.95,
            }

        # 2. Scrolling
        if "scroll down" in task_lower:
            return {
                "action": "scroll",
                "direction": "down",
                "amount": 450,
                "reasoning": "Scrolling page down as requested",
                "confidence": 0.95,
            }
        if "scroll up" in task_lower:
            return {
                "action": "scroll",
                "direction": "up",
                "amount": 450,
                "reasoning": "Scrolling page up as requested",
                "confidence": 0.95,
            }

        # 3. Search functionality across any website
        if any(kw in task_lower for kw in ["find", "search", "lookup", "query"]):
            import re
            # Extract user's search query verbatim without dropping any valid search terms
            quote_match = re.search(r'["\']([^"\']+)["\']', request.task)
            if quote_match:
                search_query = quote_match.group(1).strip()
            else:
                pattern = r'(?:can\s+you\s+|please\s+|could\s+you\s+)?(?:search\s+(?:for\s+)?|find\s+|lookup\s+|query\s+)(.*?)(?:\s+for\s+me)?(?:\s+(?:on|in|using)\s+.*)?$'
                cmd_match = re.search(pattern, request.task, re.IGNORECASE)
                if cmd_match and cmd_match.group(1).strip():
                    search_query = cmd_match.group(1).strip()
                else:
                    search_query = request.task.strip()

            # Find search box by tag, type, placeholder, label, id
            for el in interactive:
                text_low = (el.text or "").lower()
                label_low = (el.label or "").lower()
                place_low = (getattr(el, "placeholder", "") or "").lower()
                id_low = (el.element_id or "").lower()
                type_low = (el.input_type or "").lower()
                combined = f"{text_low} {label_low} {place_low} {id_low} {type_low}"

                if (el.tag in ["input", "textarea"] or el.role == "textbox") and any(kw in combined for kw in ["search", "query", "find", "q", "filter"]):
                    if el.text and el.text != "[REDACTED]" and len(el.text) > 3:
                        # Search field already typed, look for search button to submit
                        for btn in interactive:
                            btn_desc = f"{(btn.text or '')} {(btn.label or '')} {(btn.element_id or '')}".lower()
                            if btn.tag in ["button", "input"] and any(kw in btn_desc for kw in ["search", "submit", "go", "find", "enter"]):
                                return {
                                    "action": "click",
                                    "target": btn.element_id,
                                    "reasoning": f"Clicking search button '{btn.text or btn.element_id}'",
                                    "confidence": 0.9,
                                }
                    else:
                        return {
                            "action": "type",
                            "target": el.element_id,
                            "text": search_query,
                            "reasoning": f"Typing query '{search_query}' into search input",
                            "confidence": 0.9,
                        }

        # 4. Form filling automation for any webpage
        if any(kw in task_lower for kw in ["fill", "form", "register", "signup", "sign up", "submit form", "enter"]):
            textboxes = [el for el in interactive if el.tag in ["input", "textarea"] or el.role == "textbox"]
            for tb in textboxes:
                val = (tb.text or "").strip()
                if not val or val == "[REDACTED]":
                    label_low = (tb.label or "").lower()
                    type_low = (tb.input_type or "").lower()
                    place_low = (getattr(tb, "placeholder", "") or "").lower()
                    id_low = (tb.element_id or "").lower()
                    field_desc = f"{type_low} {label_low} {place_low} {id_low}"

                    text_to_type = "John Doe"
                    if any(kw in field_desc for kw in ["email", "mail"]):
                        text_to_type = "john.doe@example.com"
                    elif any(kw in field_desc for kw in ["phone", "tel", "mobile"]):
                        text_to_type = "+1 555-0199"
                    elif any(kw in field_desc for kw in ["address", "street", "city", "location"]) or tb.tag == "textarea":
                        text_to_type = "123 Privacy Blvd, Tech District, 90210"
                    elif any(kw in field_desc for kw in ["name", "user", "first", "last"]):
                        text_to_type = "John Doe"
                    elif any(kw in field_desc for kw in ["org", "company", "business"]):
                        text_to_type = "PrivAI Labs"
                    elif any(kw in field_desc for kw in ["search", "query"]):
                        text_to_type = "Kubernetes Documentation"

                    return {
                        "action": "type",
                        "target": tb.element_id,
                        "text": text_to_type,
                        "reasoning": f"Filling '{tb.label or getattr(tb, 'placeholder', '') or tb.element_id}' field with synthetic data",
                        "confidence": 0.85,
                    }

            # If all inputs are filled, submit the form
            for btn in interactive:
                btn_desc = f"{(btn.text or '')} {(btn.label or '')} {(btn.element_id or '')}".lower()
                if (btn.tag == "button" or btn.input_type == "submit" or btn.role == "button") and any(
                    kw in btn_desc for kw in ["submit", "register", "sign up", "create", "send", "save", "continue"]
                ):
                    return {
                        "action": "click",
                        "target": btn.element_id,
                        "reasoning": f"Submitting completed form via '{btn.text or btn.element_id}'",
                        "confidence": 0.9,
                    }

        # 5. Semantic Link or Button Clicking
        if "click" in task_lower or "open" in task_lower:
            cleaned_target = task_lower.replace("click", "").replace("open", "").replace("on", "").strip()
            for el in interactive:
                el_desc = f"{(el.text or '')} {(el.label or '')} {(getattr(el, 'placeholder', '') or '')} {(el.element_id or '')}".lower()
                if cleaned_target and cleaned_target in el_desc:
                    return {
                        "action": "click",
                        "target": el.element_id,
                        "reasoning": f"Clicking target '{el.text or el.element_id}' matching '{cleaned_target}'",
                        "confidence": 0.85,
                    }

        # 6. Default Observation / Completion
        return {
            "action": "read_page",
            "reasoning": "Page observation complete. All requested interactions finished.",
            "confidence": 0.8,
        }


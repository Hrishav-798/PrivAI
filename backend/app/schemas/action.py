"""PrivAI Backend — Pydantic Schemas for Action JSON"""

from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional


class Action(BaseModel):
    """Strict action schema. Only these actions can be returned to the browser."""

    action: Literal[
        "click", "type", "scroll", "navigate", "go_back", "read_page", "wait",
        "select", "check", "uncheck", "extract", "scroll_to_element",
        "scroll_to_top", "scroll_to_bottom", "press_key", "wait_for_element",
        "finish", "ask_user"
    ]
    target: Optional[str] = None
    text: Optional[str] = None
    direction: Optional[Literal["up", "down", "left", "right"]] = None
    amount: Optional[int] = None
    url: Optional[str] = None
    value: Optional[str] = None  # For select actions
    key: Optional[str] = None  # For press_key action
    question: Optional[str] = None  # For ask_user action
    selector: Optional[str] = None  # For extract action
    answer: Optional[str] = None  # For finish action

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 0 or v > 5000):
            raise ValueError("Scroll amount must be between 0 and 5000")
        return v

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.startswith(("http://", "https://")):
                raise ValueError("URL must use http:// or https:// scheme")
        return v

    @field_validator("text")
    @classmethod
    def validate_text_safety(cls, v: Optional[str]) -> Optional[str]:
        """Reject text containing obvious injection attempts."""
        if v is not None:
            dangerous_patterns = ["javascript:", "eval(", "<script", "document.cookie"]
            for pattern in dangerous_patterns:
                if pattern.lower() in v.lower():
                    raise ValueError(f"Unsafe text content detected: {pattern}")
        return v


class ActionResponse(BaseModel):
    """Response containing the validated action and reasoning."""

    action: Action
    reasoning: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    vlm_ms: float = 0.0


class ErrorResponse(BaseModel):
    error: str
    detail: str = ""

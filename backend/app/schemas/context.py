"""PrivAI Backend — Pydantic Schemas for Sanitized Context"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, Any


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class DOMElement(BaseModel):
    element_id: str = Field(alias="id", default="")
    role: Optional[str] = ""
    text: Optional[str] = ""
    label: Optional[str] = ""
    tag: str = ""
    bbox: Optional[BBox] = None
    visible: bool = True
    interactive: bool = False
    input_type: Optional[str] = None
    enabled: bool = True
    placeholder: Optional[str] = ""
    # New fields from enhanced DOM scanner
    xpath: Optional[str] = None
    css_selector: Optional[str] = Field(default=None, alias="cssSelector")
    in_viewport: Optional[bool] = Field(default=None, alias="inViewport")
    semantic_role: Optional[str] = Field(default=None, alias="semanticRole")
    highlight_index: Optional[int] = Field(default=None, alias="highlightIndex")
    href: Optional[str] = None
    alt: Optional[str] = None
    checked: Optional[bool] = None
    selected_value: Optional[str] = Field(default=None, alias="selectedValue")
    child_count: Optional[int] = Field(default=None, alias="childCount")

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "element_id" in data and "id" not in data:
                data["id"] = data["element_id"]
            elif "id" in data and "element_id" not in data:
                data["element_id"] = data["id"]
            if "type" in data and not data.get("input_type"):
                data["input_type"] = data["type"]
        return data


class Redaction(BaseModel):
    type: str  # password, email, phone, face, name, address, id, api_key, credit_card, secret
    bbox: BBox
    treatment: str  # blackout, mask, blur


from typing import Optional, Any, Union


class PageState(BaseModel):
    """Page state metadata from the enhanced DOM scanner."""
    url: str = ""
    title: str = ""
    scroll_y: float = Field(default=0, alias="scrollY")
    scroll_x: float = Field(default=0, alias="scrollX")
    viewport_width: int = Field(default=1440, alias="viewportWidth")
    viewport_height: int = Field(default=900, alias="viewportHeight")
    total_height: int = Field(default=0, alias="totalHeight")
    total_width: int = Field(default=0, alias="totalWidth")
    ready_state: str = Field(default="complete", alias="readyState")
    is_stable: bool = Field(default=True, alias="isStable")

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_page_state(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "scroll_position" in data and isinstance(data["scroll_position"], dict):
                data["scrollY"] = data["scroll_position"].get("y", 0)
                data["scrollX"] = data["scroll_position"].get("x", 0)
            if "viewport_size" in data and isinstance(data["viewport_size"], dict):
                data["viewportWidth"] = data["viewport_size"].get("width", 1440)
                data["viewportHeight"] = data["viewport_size"].get("height", 900)
            if "is_ready" in data:
                data["isStable"] = bool(data["is_ready"])
        return data


class ScreenMetadata(BaseModel):
    width: int = 1440
    height: int = 900


class PrivacyMetadata(BaseModel):
    raw_data_removed: bool = True
    sanitized: bool = True
    regions_detected: int = 0
    regions_redacted: int = 0
    scan_ms: float = 0


class AgentRequest(BaseModel):
    task: str
    screen: ScreenMetadata = ScreenMetadata()
    dom: list[DOMElement] = Field(default_factory=list, alias="sanitized_dom")
    redactions: list[Redaction] = Field(default_factory=list)
    privacy: PrivacyMetadata = PrivacyMetadata()
    sanitized_screenshot: Optional[str] = None  # base64 data URL
    page_title: Optional[str] = ""
    page_url: Optional[str] = ""
    # New fields from enhanced agent loop
    page_state: Optional[PageState] = None
    semantic_tree: Optional[str] = None
    step_history: Optional[Union[str, list[Any]]] = None

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_request(cls, data: Any) -> Any:
        if isinstance(data, dict):
            history = data.get("step_history")
            if isinstance(history, list):
                # Convert list of steps into a formatted string
                lines = []
                for item in history:
                    if isinstance(item, dict):
                        step_num = item.get("step", "?")
                        action = item.get("action", {})
                        result = item.get("result", "")
                        lines.append(f"Step {step_num}: {action} -> {result}")
                    else:
                        lines.append(str(item))
                data["step_history"] = "\n".join(lines)
        return data

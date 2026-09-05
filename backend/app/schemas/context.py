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
    type: str  # password, email, phone, face, name, address, id
    bbox: BBox
    treatment: str  # blackout, mask, blur


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

    model_config = {"populate_by_name": True}

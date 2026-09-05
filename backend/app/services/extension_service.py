"""PrivAI Backend — Extension Connection Tracker Service
Tracks heartbeats and capability reports from the browser extension.
"""

import time
from typing import Optional, Dict, Any


class ExtensionService:
    def __init__(self):
        self.last_heartbeat: Optional[float] = None
        self.vision_backend: str = "none"
        self.vision_model: str = "UltraFace ONNX"
        self.active_tab_title: str = ""
        self.version: str = "1.0.0"

    def record_heartbeat(self, data: Dict[str, Any]) -> None:
        self.last_heartbeat = time.time()
        self.vision_backend = data.get("vision_backend", self.vision_backend)
        self.vision_model = data.get("vision_model", self.vision_model)
        self.active_tab_title = data.get("active_tab_title", self.active_tab_title)
        self.version = data.get("version", self.version)

    def is_connected(self, timeout_seconds: float = 30.0) -> bool:
        if self.last_heartbeat is None:
            return False
        return (time.time() - self.last_heartbeat) < timeout_seconds

    def get_status(self) -> Dict[str, Any]:
        connected = self.is_connected()
        last_seen = None
        if self.last_heartbeat is not None:
            last_seen = round(time.time() - self.last_heartbeat, 1)

        return {
            "connected": connected,
            "vision_backend": self.vision_backend if connected else "unknown",
            "vision_model": self.vision_model,
            "last_seen_seconds_ago": last_seen,
            "version": self.version,
        }


extension_service = ExtensionService()

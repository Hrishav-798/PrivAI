"""PrivAI Backend — Event Service
Maintains an in-memory ring buffer of real-time system activity events.
Streams real events to the monitoring dashboard without fake data.
"""

import time
from typing import Any
from collections import deque


class EventService:
    def __init__(self, max_events: int = 100):
        self._events = deque(maxlen=max_events)
        # Seed initial system event
        self.add_event(
            event="system_init",
            label="FastAPI Backend Online",
            detail="PrivAI defense-in-depth API listening on port 8000",
            level="info",
        )

    def add_event(
        self,
        event: str,
        label: str,
        detail: str = "",
        level: str = "info",
        timestamp: float | None = None,
    ) -> dict[str, Any]:
        item = {
            "id": f"evt_{int(time.time() * 1000)}_{len(self._events)}",
            "event": event,
            "label": label,
            "detail": detail,
            "level": level,
            "timestamp": timestamp or (time.time() * 1000),
        }
        self._events.append(item)
        return item

    def get_events(self, limit: int = 50) -> list[dict[str, Any]]:
        events = list(self._events)
        events.reverse()
        return events[:limit]

    def clear(self):
        self._events.clear()


event_service = EventService()

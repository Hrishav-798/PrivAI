"""PrivAI Backend — Telemetry and Event Stream Routes"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Optional

from app.services.event_service import event_service
from app.services.metrics_service import metrics_service
from app.services.extension_service import extension_service

router = APIRouter()


class HeartbeatRequest(BaseModel):
    vision_backend: Optional[str] = "wasm"
    vision_model: Optional[str] = "UltraFace ONNX"
    active_tab_title: Optional[str] = ""
    version: Optional[str] = "1.0.0"


class EventItem(BaseModel):
    event: str
    label: str
    detail: Optional[str] = ""
    level: Optional[str] = "info"
    timestamp: Optional[float] = None


class ExecuteResultRequest(BaseModel):
    action: dict[str, Any]
    success: bool
    error: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None


@router.post("/heartbeat")
async def receive_heartbeat(payload: HeartbeatRequest):
    """Receive heartbeat from active Chrome extension instance."""
    extension_service.record_heartbeat(payload.model_dump())
    return {"status": "ok", "recorded_at": payload.model_dump()}


@router.get("/events")
async def get_events(limit: int = 50):
    """Retrieve real-time event logs for the monitoring dashboard."""
    return {"events": event_service.get_events(limit)}


@router.post("/events")
async def post_event(item: EventItem):
    """Ingest a live activity event from the extension or backend pipeline."""
    return event_service.add_event(
        event=item.event,
        label=item.label,
        detail=item.detail or "",
        level=item.level or "info",
        timestamp=item.timestamp,
    )


@router.get("/metrics")
async def get_metrics():
    """Retrieve evaluation benchmark metrics and telemetry."""
    return metrics_service.get_metrics_report()


@router.post("/agent/execute-result")
async def record_execute_result(payload: ExecuteResultRequest):
    """Record execution feedback and latency metrics from the browser executor."""
    metrics_service.record_execution_result(payload.model_dump())
    event_service.add_event(
        event="action_result",
        label=f"Action Result: {'SUCCESS' if payload.success else 'FAILED'}",
        detail=payload.error or f"Action {payload.action.get('action')} executed",
        level="info" if payload.success else "warning",
    )
    return {"status": "ok"}


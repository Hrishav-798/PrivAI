"""PrivAI Backend — Health Check Route
Performs REAL checks for backend, Ollama service, and configured VLM model availability.
"""

import httpx
from fastapi import APIRouter
from app.config import settings
from app.services.extension_service import extension_service

router = APIRouter()


async def check_ollama_status() -> tuple[bool, bool]:
    """Real health check against the local Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name", "").lower() for m in data.get("models", [])]
                model_target = settings.ollama_model.lower()
                # Match full name or prefix (e.g. qwen2.5vl:7b or qwen2.5vl)
                model_available = any(
                    model_target in m or m in model_target for m in models
                )
                return True, model_available
    except Exception:
        pass
    return False, False


@router.get("/health")
@router.get("/api/health")
@router.get("/status")
@router.get("/api/status")
async def health_check():
    """Real health status check for dashboard and clients."""
    ollama_online, model_available = await check_ollama_status()
    ext_status = extension_service.get_status()

    return {
        "status": "healthy",
        "backend": True,
        "ollama": ollama_online,
        "model": model_available,
        "model_name": settings.ollama_model,
        "extension": ext_status,
        "service": "privai-backend",
        "version": "1.0.0",
        "privacy_model": "server_receives_only_sanitized_data",
    }


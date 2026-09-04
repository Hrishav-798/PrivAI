"""PrivAI Backend — Health Check Route"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "privai-backend",
        "version": "1.0.0",
        "privacy_model": "server_receives_only_sanitized_data",
    }

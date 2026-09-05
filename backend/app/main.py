"""PrivAI Backend — FastAPI Application

Privacy-preserving browser agent server.
Receives ONLY sanitized context from the browser extension.
Uses Ollama + VLM for reasoning over redacted content.
Returns strict Action JSON.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.routes.health import router as health_router
from app.routes.agent import router as agent_router
from app.routes.telemetry import router as telemetry_router
from app.config import settings

# Structured logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","module":"%(module)s","message":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("PrivAI backend starting")
    logger.info(f"Ollama URL: {settings.ollama_base_url}")
    logger.info(f"Ollama model: {settings.ollama_model}")
    yield
    logger.info("PrivAI backend shutting down")


app = FastAPI(
    title="PrivAI — Privacy Browser Agent Backend",
    description=(
        "Backend server for the PrivAI privacy-preserving browser agent. "
        "Receives only sanitized/redacted context from the browser extension. "
        "Raw sensitive data never reaches this server."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for extension and dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(health_router)
app.include_router(agent_router, prefix="/api/agent")
app.include_router(telemetry_router, prefix="/api")

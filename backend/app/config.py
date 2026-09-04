"""PrivAI Backend — Configuration"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5vl:7b"
    backend_port: int = 8000
    backend_host: str = "0.0.0.0"
    log_level: str = "info"

    class Config:
        env_file = ".env"


settings = Settings()

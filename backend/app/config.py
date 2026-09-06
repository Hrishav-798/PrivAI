"""PrivAI Backend — Configuration"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5vl:7b"
    cloud_vlm_api_key: str = ""
    cloud_vlm_endpoint: str = "https://api.openai.com/v1"
    cloud_vlm_model: str = "gpt-4o"
    backend_port: int = 8000
    backend_host: str = "0.0.0.0"
    log_level: str = "info"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

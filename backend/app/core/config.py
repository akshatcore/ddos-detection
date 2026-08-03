from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ML-Based DDoS Detection"
    environment: str = "development"
    database_url: str = "sqlite:///./ddos_detection.db"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    session_timeout_minutes: int = 30
    confidence_threshold: float = 0.85
    packet_rate_threshold: float = 100.0
    mitigation_interface: str = "eth0"
    model_artifact_dir: str = "models"
    log_level: str = "INFO"
    backend_cors_origins: List[str] = Field(default_factory=lambda: ["*"])


@lru_cache
def get_settings() -> Settings:
    return Settings()

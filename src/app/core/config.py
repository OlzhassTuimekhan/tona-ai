from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
load_dotenv(_PROJECT_ROOT / ".env")


class Settings(BaseSettings):
    SONIOX_API_KEY: str
    LLM_API_KEY: str
    LLM_BASE_URL: str | None = None
    LLM_MODEL: str | None = None
    LLM_MODEL_FAST: str | None = None

    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"

    WEBHOOK_SECRET: str = ""
    TEMP_AUDIO_DIR: Path = _PROJECT_ROOT / "temp_audio"
    UPLOADS_DIR: Path = _PROJECT_ROOT / "uploads"

    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_EXPIRE_HOURS: int = 24
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"

    SONIOX_MAX_DURATION_SEC: int = 14400

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    REGISTRY_REDIS_URL: str = ""

    DATABASE_URL: str = ""

    S3_BUCKET: str = ""
    S3_REGION: str = "us-east-1"
    S3_ENDPOINT_URL: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_PUBLIC_BASE_URL: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
settings.TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

PROJECT_ROOT = _PROJECT_ROOT


def registry_redis_url(s: Settings) -> str:
    u = (s.REGISTRY_REDIS_URL or "").strip()
    if u:
        return u
    broker = s.CELERY_BROKER_URL.rstrip("/")
    if broker.endswith("/0"):
        return broker[:-1] + "1"
    if "/" in broker.split("://", 1)[-1] and broker[-1].isdigit():
        return broker.rsplit("/", 1)[0] + "/1"
    return broker + "/1"

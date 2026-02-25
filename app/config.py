from pydantic_settings import BaseSettings
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    SONIOX_API_KEY: str
    LLM_API_KEY: str
    LLM_BASE_URL: str | None = None
    LLM_MODEL: str | None = None
    LLM_MODEL_FAST: str | None = None

    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"

    WEBHOOK_SECRET: str = ""
    TEMP_AUDIO_DIR: Path = PROJECT_ROOT / "temp_audio"

    SONIOX_MAX_DURATION_SEC: int = 14400

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
settings.TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

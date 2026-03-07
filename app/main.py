import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.legacy import router as legacy_router
from app.api.v1.router import router as v1_router
from app.application.auth_service import hash_password
from app.core.config import settings
from app.infrastructure.persistence.redis_registry import RedisRegistry

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def _seed_admin() -> None:
    """Create the initial admin user from env vars if it doesn't exist yet."""
    username = (settings.ADMIN_USERNAME or "").strip()
    password = (settings.ADMIN_PASSWORD or "").strip()
    if not username or not password:
        return
    try:
        reg = RedisRegistry(settings)
        if reg.get_user_by_username(username):
            return
        reg.save_user({
            "username": username,
            "password_hash": hash_password(password),
            "role": "admin",
            "org": None,
            "city": None,
            "region": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        log.info("Admin user '%s' created from env vars.", username)
    except Exception:
        log.warning("Could not seed admin user (Redis may not be ready).", exc_info=True)


def create_app() -> FastAPI:
    app = FastAPI(
        title="JOIS Analysis Platform",
        description="Каркас GovTech: аудио → ASR → структурированный анализ (расширяемые профили).",
        version="1.1.0",
    )

    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(v1_router, prefix="/api/v1")
    app.include_router(legacy_router)

    app.mount("/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")

    @app.on_event("startup")
    def on_startup() -> None:
        _seed_admin()

    return app


app = create_app()

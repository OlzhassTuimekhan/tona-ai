import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.legacy import router as legacy_router
from app.api.v1.router import router as v1_router
from app.application.auth_service import hash_password
from app.core.config import settings
from app.infrastructure.persistence.factory import get_registry_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger(__name__)


def _init_postgres_schema() -> None:
    if not (settings.DATABASE_URL or "").strip():
        return
    try:
        from app.infrastructure.persistence.db import get_engine
        from app.infrastructure.persistence.orm_models import Base

        Base.metadata.create_all(bind=get_engine())
        log.info("PostgreSQL schema ensured (create_all).")
    except Exception:
        log.warning("Could not init PostgreSQL schema.", exc_info=True)


def _seed_admin() -> None:
    """Create the initial admin user from env vars if it doesn't exist yet."""
    username = (settings.ADMIN_USERNAME or "").strip()
    password = (settings.ADMIN_PASSWORD or "").strip()
    if not username or not password:
        return
    try:
        reg = get_registry_store(settings)
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
        log.warning("Could not seed admin user (DB/Redis may not be ready).", exc_info=True)


def create_app() -> FastAPI:
    app = FastAPI(
        title="JOIS Analysis Platform",
        description="GovTech stack: audio → ASR → structured analysis (pluggable profiles).",
        version="1.2.0",
    )

    origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    # Bearer tokens in Authorization — cookies не используются; True + allow_origins=["*"]
    # ломает CORS в браузерах (Safari: «Load failed» без статуса).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(v1_router, prefix="/api/v1")
    app.include_router(legacy_router)

    @app.get("/")
    def root():
        return {
            "service": "JOIS Analysis Platform",
            "api": "/api/v1",
            "health": "/api/v1/health",
            "docs": "/docs",
        }

    app.mount("/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")

    @app.on_event("startup")
    def on_startup() -> None:
        _init_postgres_schema()
        _seed_admin()

    return app


app = create_app()

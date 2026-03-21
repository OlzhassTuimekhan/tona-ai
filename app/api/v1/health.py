from fastapi import APIRouter

from app.core.config import settings
from app.infrastructure.persistence.factory import get_registry_store

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    out: dict = {"status": "ok", "service": "jois-analysis-platform"}
    store = get_registry_store(settings)
    try:
        store_ok = store.ping()
    except Exception:
        store_ok = False
    out["registry"] = "postgres" if (settings.DATABASE_URL or "").strip() else "redis"
    out["registry_ok"] = bool(store_ok)
    return out

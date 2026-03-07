from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.application.analysis_service import AnalysisService
from app.application.auth_service import decode_token
from app.application.registry_service import RegistryService
from app.core.config import settings
from app.infrastructure.persistence.redis_registry import RedisRegistry

_bearer = HTTPBearer(auto_error=False)


def get_analysis_service() -> AnalysisService:
    return AnalysisService(settings)


def get_redis_registry() -> RedisRegistry:
    return RedisRegistry(settings)


def get_registry_service() -> RegistryService:
    return RegistryService(get_analysis_service(), get_redis_registry())


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    reg: RedisRegistry = Depends(get_redis_registry),
) -> dict[str, Any]:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")
    try:
        payload = decode_token(creds.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    user = reg.get_user(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_not_found")
    return user


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_required")
    return user


def require_akim(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in ("admin", "akim"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="akim_or_admin_required")
    return user

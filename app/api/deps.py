from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.application.analysis_service import AnalysisService
from app.application.auth_service import decode_token
from app.application.registry_service import RegistryService
from app.application.role_policy import is_operator_role
from app.core.config import settings
from app.infrastructure.persistence.factory import get_registry_store
from app.infrastructure.persistence.protocol import RegistryStore

_bearer = HTTPBearer(auto_error=False)


def get_analysis_service() -> AnalysisService:
    return AnalysisService(settings)


def get_registry() -> RegistryStore:
    return get_registry_store(settings)


# Обратная совместимость имён
get_redis_registry = get_registry


def get_registry_service() -> RegistryService:
    return RegistryService(get_analysis_service(), get_registry())


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    reg: RegistryStore = Depends(get_registry),
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


def require_operator(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Админ или оператор (аким, суд, полиция, call-центр и т.д.)."""
    if not is_operator_role(user.get("role")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="operator_required")
    return user


# Обратная совместимость имён
require_akim = require_operator


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    reg: RegistryStore = Depends(get_registry),
) -> dict[str, Any] | None:
    """Bearer optional: no header → None; invalid/expired token → None (guest flow)."""
    if creds is None:
        return None
    try:
        payload = decode_token(creds.credentials)
    except JWTError:
        return None
    user = reg.get_user(payload["sub"])
    return user

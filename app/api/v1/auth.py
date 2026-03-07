from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_redis_registry
from app.application.auth_service import create_token, verify_password
from app.infrastructure.persistence.redis_registry import RedisRegistry

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, reg: RedisRegistry = Depends(get_redis_registry)):
    user = reg.get_user_by_username(body.username)
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    token = create_token(user["id"], user["role"])
    safe = {k: v for k, v in user.items() if k != "password_hash"}
    return LoginResponse(token=token, user=safe)


@router.get("/me")
def me(user: dict[str, Any] = Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "password_hash"}

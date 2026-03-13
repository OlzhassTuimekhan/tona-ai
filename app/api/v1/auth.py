from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_current_user, get_redis_registry
from app.application.auth_service import create_token, hash_password, verify_password
from app.application.role_policy import enrich_user_response
from app.infrastructure.persistence.redis_registry import RedisRegistry

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=6, max_length=200)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    district: str = Field(min_length=1, max_length=200, description="Район проживания")
    city: str | None = Field(None, max_length=120)
    region: str | None = Field(None, max_length=120)
    phone: str | None = Field(None, max_length=32)

    @field_validator("username")
    @classmethod
    def username_ok(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 3:
            raise ValueError("username_too_short")
        return s

    @field_validator("first_name", "last_name", "district", "city", "region", "phone", mode="before")
    @classmethod
    def strip_opt(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip()
        return v


class ProfileUpdateRequest(BaseModel):
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    district: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=120)
    region: str | None = Field(None, max_length=120)
    phone: str | None = Field(None, max_length=32)


def _safe_user(u: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in u.items() if k != "password_hash"}


def _user_for_client(u: dict[str, Any]) -> dict[str, Any]:
    return enrich_user_response(_safe_user(u))


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, reg: RedisRegistry = Depends(get_redis_registry)):
    user = reg.get_user_by_username(body.username.strip())
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    token = create_token(user["id"], user["role"])
    return LoginResponse(token=token, user=_user_for_client(user))


@router.post("/register", response_model=LoginResponse, status_code=201)
def register(body: RegisterRequest, reg: RedisRegistry = Depends(get_redis_registry)):
    uname = body.username.strip()
    if reg.get_user_by_username(uname):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username_taken")
    user = {
        "username": uname,
        "password_hash": hash_password(body.password),
        "role": "citizen",
        "first_name": body.first_name,
        "last_name": body.last_name,
        "district": body.district,
        "city": (body.city or "").strip() or None,
        "region": (body.region or "").strip() or None,
        "phone": (body.phone or "").strip() or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    uid = reg.save_user(user)
    user = reg.get_user(uid) or {**user, "id": uid}
    token = create_token(user["id"], user["role"])
    return LoginResponse(token=token, user=_user_for_client(user))


@router.get("/me")
def me(user: dict[str, Any] = Depends(get_current_user)):
    return _user_for_client(user)


@router.patch("/me")
def patch_me(
    body: ProfileUpdateRequest,
    user: dict[str, Any] = Depends(get_current_user),
    reg: RedisRegistry = Depends(get_redis_registry),
):
    raw = body.model_dump(exclude_unset=True)
    data: dict[str, Any] = {}
    for k, v in raw.items():
        if isinstance(v, str):
            t = v.strip()
            if k in ("city", "region", "phone") and t == "":
                data[k] = None
            elif t == "":
                continue
            else:
                data[k] = t
        else:
            data[k] = v
    updated = reg.update_user_fields(user["id"], data)
    if not updated:
        raise HTTPException(status_code=404, detail="user_not_found")
    return _user_for_client(updated)

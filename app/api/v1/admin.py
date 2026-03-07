from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_redis_registry, require_admin
from app.application.auth_service import hash_password
from app.infrastructure.persistence.redis_registry import RedisRegistry

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=4, max_length=200)
    role: str = Field(pattern=r"^(admin|akim)$")
    org: str | None = None
    city: str | None = None
    region: str | None = None


@router.post("/users", status_code=201)
def create_user(
    body: CreateUserRequest,
    _: dict[str, Any] = Depends(require_admin),
    reg: RedisRegistry = Depends(get_redis_registry),
):
    if reg.get_user_by_username(body.username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username_taken")
    user = {
        "username": body.username,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "org": (body.org or "").strip() or None,
        "city": (body.city or "").strip() or None,
        "region": (body.region or "").strip() or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    uid = reg.save_user(user)
    user["id"] = uid
    return {k: v for k, v in user.items() if k != "password_hash"}


@router.get("/users")
def list_users(
    _: dict[str, Any] = Depends(require_admin),
    reg: RedisRegistry = Depends(get_redis_registry),
):
    users = reg.list_users()
    return {"users": [{k: v for k, v in u.items() if k != "password_hash"} for u in users]}


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    admin: dict[str, Any] = Depends(require_admin),
    reg: RedisRegistry = Depends(get_redis_registry),
):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="cannot_delete_self")
    if not reg.delete_user(user_id):
        raise HTTPException(status_code=404, detail="user_not_found")

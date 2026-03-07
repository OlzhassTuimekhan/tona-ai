from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_redis_registry, get_registry_service, require_admin
from app.application.auth_service import hash_password
from app.application.registry_service import RegistryService, calculate_rating, _deadline_status
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


@router.get("/dashboard")
def admin_dashboard(
    _: dict[str, Any] = Depends(require_admin),
    reg: RedisRegistry = Depends(get_redis_registry),
    svc: RegistryService = Depends(get_registry_service),
):
    users = reg.list_users()
    akims = [u for u in users if u.get("role") == "akim"]

    all_sessions = svc.list_sessions(skip=0, limit=500)
    published_ids = set(s["id"] for s in all_sessions if s.get("published"))

    total_commitments = 0
    total_fulfilled = 0
    total_overdue = 0
    total_observations = 0
    org_data: dict[str, dict[str, Any]] = {}
    overdue_items: list[dict[str, Any]] = []

    pub_rows = svc.list_public_sessions(skip=0, limit=500)
    for sid_info in pub_rows:
        sid = sid_info["id"]
        doc = svc.get_session(sid)
        if not doc:
            continue
        org_name = doc.get("public_org") or "Без организации"
        pl = doc.get("payload") or {}
        com = pl.get("commitments")
        com_list = com if isinstance(com, list) else []
        obs = doc.get("observations") or []

        n_com = len(com_list)
        n_obs = len(obs) if isinstance(obs, list) else 0
        n_fulfilled = sum(1 for c in com_list if isinstance(c, dict) and c.get("fulfillment_status") == "fulfilled")
        n_overdue = sum(
            1 for c in com_list
            if isinstance(c, dict) and _deadline_status(c.get("deadline"), c.get("fulfillment_status")) == "overdue"
        )

        total_commitments += n_com
        total_fulfilled += n_fulfilled
        total_overdue += n_overdue
        total_observations += n_obs

        if org_name not in org_data:
            org_data[org_name] = {
                "org": org_name,
                "city": doc.get("city"),
                "sessions": 0,
                "commitments": 0,
                "fulfilled": 0,
                "overdue": 0,
                "observations": 0,
            }
        od = org_data[org_name]
        od["sessions"] += 1
        od["commitments"] += n_com
        od["fulfilled"] += n_fulfilled
        od["overdue"] += n_overdue
        od["observations"] += n_obs

        for ci, c in enumerate(com_list):
            if not isinstance(c, dict):
                continue
            if _deadline_status(c.get("deadline"), c.get("fulfillment_status")) == "overdue":
                overdue_items.append({
                    "session_id": sid,
                    "session_title": doc.get("title", "")[:60],
                    "org": org_name,
                    "index": ci,
                    "description": (c.get("description") or "")[:80],
                    "deadline": c.get("deadline"),
                    "responsible": c.get("responsible"),
                })

    orgs_list = sorted(org_data.values(), key=lambda o: -o["overdue"])
    for o in orgs_list:
        total = o["commitments"] or 1
        o["fulfillment_pct"] = round(o["fulfilled"] / total * 100)
        o["overdue_pct"] = round(o["overdue"] / total * 100)

    return {
        "totals": {
            "sessions": len(all_sessions),
            "published": len(published_ids),
            "commitments": total_commitments,
            "fulfilled": total_fulfilled,
            "overdue": total_overdue,
            "observations": total_observations,
            "akims": len(akims),
        },
        "orgs": orgs_list,
        "overdue_items": overdue_items[:20],
    }

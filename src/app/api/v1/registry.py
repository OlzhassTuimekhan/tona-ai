from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_registry_service, require_operator
from app.application.registry_service import RegistryService, _enrich_commitments_deadlines, _deadline_status
from app.application.role_policy import assert_analysis_type_allowed
from pydantic import BaseModel, Field

from app.domain.models import (
    PublishSessionBody,
    RegistryImportBody,
    RegistryImportResponse,
    RegistrySessionListResponse,
    RegistrySessionSummary,
)


class CommitmentStatusBody(BaseModel):
    status: str = Field(pattern=r"^(fulfilled|pending)$")

router = APIRouter(prefix="/registry", tags=["registry"])


def _org_filter(doc: dict[str, Any], user: dict[str, Any]) -> bool:
    """Admin sees everything; akim sees sessions with matching org OR not yet published."""
    if user.get("role") == "admin":
        return True
    doc_org = (doc.get("public_org") or "").strip()
    if not doc_org:
        return True
    user_org = (user.get("org") or "").lower().strip()
    return user_org != "" and doc_org.lower() == user_org


@router.post("/import", response_model=RegistryImportResponse)
def import_completed_analysis(
    body: RegistryImportBody,
    user: dict[str, Any] = Depends(require_operator),
    svc: RegistryService = Depends(get_registry_service),
):
    at = body.analysis_type or "general"
    assert_analysis_type_allowed(user, at)
    try:
        sid, dup = svc.import_task(
            body.task_id,
            analysis_type=at,
            title_override=body.title_override,
            user=user,
        )
        return RegistryImportResponse(session_id=sid, duplicate=dup)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/sessions", response_model=RegistrySessionListResponse)
def list_registry_sessions(
    skip: int = 0,
    limit: int = 50,
    user: dict[str, Any] = Depends(require_operator),
    svc: RegistryService = Depends(get_registry_service),
):
    cap = min(max(limit, 1), 100)
    rows = svc.list_sessions(skip=max(skip, 0), limit=cap)
    if user.get("role") != "admin":
        user_org = (user.get("org") or "").lower().strip()
        rows = [r for r in rows if not (r.get("public_org") or "").strip()
                or (r.get("public_org") or "").lower().strip() == user_org]
    return RegistrySessionListResponse(
        sessions=[RegistrySessionSummary(**r) for r in rows]
    )


@router.get("/sessions/{session_id}")
def get_registry_session(
    session_id: str,
    user: dict[str, Any] = Depends(require_operator),
    svc: RegistryService = Depends(get_registry_service),
):
    doc = svc.get_session(session_id)
    if not doc:
        raise HTTPException(status_code=404, detail="session_not_found")
    if not _org_filter(doc, user):
        raise HTTPException(status_code=403, detail="org_mismatch")
    pl = doc.get("payload")
    if isinstance(pl, dict):
        raw_com = pl.get("commitments")
        if isinstance(raw_com, list):
            pl["commitments"] = _enrich_commitments_deadlines(raw_com)
    return doc


@router.patch("/sessions/{session_id}/publish")
def publish_registry_session(
    session_id: str,
    body: PublishSessionBody,
    user: dict[str, Any] = Depends(require_operator),
    svc: RegistryService = Depends(get_registry_service),
):
    try:
        doc = svc.set_published(session_id, body, user=user)
    except ValueError as e:
        if str(e) == "session_not_found":
            raise HTTPException(status_code=404, detail="session_not_found") from e
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "id": doc.get("id"),
        "published": doc.get("published"),
        "public_org": doc.get("public_org"),
        "published_at": doc.get("published_at"),
    }


@router.patch("/sessions/{session_id}/commitments/{index}/status")
def set_commitment_status(
    session_id: str,
    index: int,
    body: CommitmentStatusBody,
    user: dict[str, Any] = Depends(require_operator),
    svc: RegistryService = Depends(get_registry_service),
):
    doc = svc.get_session(session_id)
    if not doc:
        raise HTTPException(status_code=404, detail="session_not_found")
    if not _org_filter(doc, user):
        raise HTTPException(status_code=403, detail="org_mismatch")
    if body.status == "fulfilled" and user.get("role") != "admin":
        pl = doc.get("payload") or {}
        com = pl.get("commitments")
        if isinstance(com, list) and 0 <= index < len(com):
            c = com[index]
            if isinstance(c, dict) and _deadline_status(c.get("deadline"), c.get("fulfillment_status")) == "overdue":
                raise HTTPException(
                    status_code=400,
                    detail="overdue_cannot_fulfill",
                )
    try:
        return svc.set_commitment_status(session_id, index, body.status, user=user)
    except ValueError as e:
        code = str(e)
        if code == "commitment_index_out_of_range":
            raise HTTPException(status_code=400, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_registry_service, require_akim
from app.application.registry_service import RegistryService
from app.domain.models import (
    PublishSessionBody,
    RegistryImportBody,
    RegistryImportResponse,
    RegistrySessionListResponse,
    RegistrySessionSummary,
)

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
    user: dict[str, Any] = Depends(require_akim),
    svc: RegistryService = Depends(get_registry_service),
):
    try:
        sid, dup = svc.import_task(
            body.task_id,
            analysis_type=body.analysis_type,
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
    user: dict[str, Any] = Depends(require_akim),
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
    user: dict[str, Any] = Depends(require_akim),
    svc: RegistryService = Depends(get_registry_service),
):
    doc = svc.get_session(session_id)
    if not doc:
        raise HTTPException(status_code=404, detail="session_not_found")
    if not _org_filter(doc, user):
        raise HTTPException(status_code=403, detail="org_mismatch")
    return doc


@router.patch("/sessions/{session_id}/publish")
def publish_registry_session(
    session_id: str,
    body: PublishSessionBody,
    user: dict[str, Any] = Depends(require_akim),
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

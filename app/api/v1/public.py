import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from app.api.deps import get_optional_user, get_registry, get_registry_service
from app.infrastructure.persistence.protocol import RegistryStore
from app.application.factories import build_soniox
from app.application.registry_service import RegistryService
from app.application.voice_human_check import transcript_confirms_not_robot
from app.core.config import settings
from app.infrastructure.storage.object_storage import s3_configured, upload_file_to_s3
from app.domain.models import (
    PublicObservationBody,
    PublicSessionListResponse,
    PublicSessionSummary,
)

router = APIRouter(prefix="/public", tags=["public"])

_MAX_VOICE_BYTES = 6 * 1024 * 1024
_MAX_PHOTO_BYTES = 10 * 1024 * 1024
_ALLOWED_PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@router.get("/sessions", response_model=PublicSessionListResponse)
def list_public_sessions(
    skip: int = 0,
    limit: int = 50,
    city: str | None = None,
    region: str | None = None,
    org: str | None = None,
    search: str | None = None,
    svc: RegistryService = Depends(get_registry_service),
):
    cap = min(max(limit, 1), 100)
    rows = svc.list_public_sessions(skip=0, limit=500)

    if city:
        c = city.lower().strip()
        rows = [r for r in rows if (r.get("city") or "").lower().strip() == c]
    if region:
        rg = region.lower().strip()
        rows = [r for r in rows if (r.get("region") or "").lower().strip() == rg]
    if org:
        o = org.lower().strip()
        rows = [r for r in rows if o in (r.get("public_org") or "").lower()]
    if search:
        q = search.lower().strip()
        rows = [r for r in rows if q in (r.get("title") or "").lower()
                or q in (r.get("public_org") or "").lower()
                or q in (r.get("city") or "").lower()]

    start = max(skip, 0)
    rows = rows[start:start + cap]
    return PublicSessionListResponse(
        sessions=[PublicSessionSummary(**r) for r in rows]
    )


@router.get("/ratings")
def get_org_ratings(
    city: str | None = None,
    region: str | None = None,
    org: str | None = None,
    search: str | None = None,
    svc: RegistryService = Depends(get_registry_service),
):
    """Aggregated ratings per public_org across all published sessions."""
    rows = svc.list_public_sessions(skip=0, limit=500)
    if city:
        c = city.lower().strip()
        rows = [r for r in rows if (r.get("city") or "").lower().strip() == c]
    if region:
        rg = region.lower().strip()
        rows = [r for r in rows if (r.get("region") or "").lower().strip() == rg]
    if org:
        o = org.lower().strip()
        rows = [r for r in rows if o in (r.get("public_org") or "").lower()]
    if search:
        q = search.lower().strip()
        rows = [r for r in rows if q in (r.get("title") or "").lower()
                or q in (r.get("public_org") or "").lower()
                or q in (r.get("city") or "").lower()]
    org_map: dict[str, list[dict]] = {}
    for row in rows:
        org_name = row.get("public_org") or "Без указания органа"
        org_map.setdefault(org_name, []).append(row)

    ratings = []
    for org_name, sessions in org_map.items():
        all_obs_count = sum(s.get("observations_total", 0) for s in sessions)
        all_photo_count = sum(s.get("observations_with_photo", 0) for s in sessions)
        total_positive = sum(s["rating"]["positive"] for s in sessions)
        total_negative = sum(s["rating"]["negative"] for s in sessions)
        total_neutral = sum(s["rating"]["neutral"] for s in sessions)
        total_obs = sum(s["rating"]["total"] for s in sessions)

        cities = {s.get("city") for s in sessions if s.get("city")}
        regions = {s.get("region") for s in sessions if s.get("region")}

        if total_obs < 3:
            level = "yellow"
            score = 50
        else:
            weighted_total = total_obs + all_photo_count * 0.5
            score = int(((total_positive - total_negative) / weighted_total + 1) * 50) if weighted_total else 50
            score = max(0, min(100, score))
            level = "green" if score >= 65 else ("red" if score <= 35 else "yellow")

        ratings.append({
            "public_org": org_name,
            "city": ", ".join(sorted(cities)) if cities else None,
            "region": ", ".join(sorted(regions)) if regions else None,
            "level": level,
            "score": score,
            "sessions_count": len(sessions),
            "observations_total": all_obs_count,
            "observations_with_photo": all_photo_count,
            "positive": total_positive,
            "negative": total_negative,
            "neutral": total_neutral,
        })

    rating_order = {"red": 0, "yellow": 1, "green": 2}
    ratings.sort(key=lambda r: (rating_order.get(r["level"], 1), -r["observations_total"]))
    return {"ratings": ratings}


@router.get("/cities")
def get_available_cities(
    svc: RegistryService = Depends(get_registry_service),
    reg: RegistryStore = Depends(get_registry),
):
    """Return distinct city/region/org values from sessions + akim profiles."""
    rows = svc.list_public_sessions(skip=0, limit=500)
    cities = {r["city"] for r in rows if r.get("city")}
    regions = {r["region"] for r in rows if r.get("region")}
    orgs = {r["public_org"] for r in rows if r.get("public_org")}

    for u in reg.list_users():
        if u.get("city"):
            cities.add(u["city"])
        if u.get("region"):
            regions.add(u["region"])
        if u.get("org"):
            orgs.add(u["org"])

    return {"cities": sorted(cities), "regions": sorted(regions), "orgs": sorted(orgs)}


@router.get("/stats")
def get_public_stats(
    svc: RegistryService = Depends(get_registry_service),
):
    """Aggregate platform stats for the hero section."""
    return svc.get_aggregate_stats()


@router.get("/sessions/{session_id}")
def get_public_session(
    session_id: str,
    svc: RegistryService = Depends(get_registry_service),
):
    view = svc.get_public_session(session_id)
    if not view:
        raise HTTPException(status_code=404, detail="not_found_or_not_published")
    return view


def _save_photo(upload: UploadFile) -> str:
    """Сохраняет фото локально или в S3; возвращает путь /uploads/... или полный HTTPS URL."""
    raw_name = upload.filename or "photo.jpg"
    ext = Path(raw_name).suffix.lower()
    if ext not in _ALLOWED_PHOTO_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Формат {ext} не поддерживается. Допустимы: {', '.join(_ALLOWED_PHOTO_EXT)}",
        )
    dest_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = settings.UPLOADS_DIR / dest_name
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    if dest_path.stat().st_size > _MAX_PHOTO_BYTES:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Фото слишком большое (макс. 10 МБ).")
    if dest_path.stat().st_size < 100:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Файл фото повреждён или пуст.")
    if s3_configured(settings):
        key = f"public/photos/{dest_name}"
        try:
            url = upload_file_to_s3(settings, dest_path, key)
        finally:
            dest_path.unlink(missing_ok=True)
        return url
    return f"/uploads/{dest_name}"


@router.post("/sessions/{session_id}/observations")
async def add_public_observation(
    session_id: str,
    observation_type: Annotated[str, Form()],
    commitment_index: Annotated[str | None, Form()] = None,
    note: Annotated[str | None, Form()] = None,
    photo_url: Annotated[str | None, Form()] = None,
    website: Annotated[str, Form()] = "",
    human_voice: UploadFile = File(...),
    photo: UploadFile | None = File(None),
    svc: RegistryService = Depends(get_registry_service),
    account: dict[str, Any] | None = Depends(get_optional_user),
):
    if website.strip():
        raise HTTPException(status_code=400, detail="Отправка отклонена.")

    if observation_type not in ("was_there", "work_done", "dispute"):
        raise HTTPException(
            status_code=400,
            detail="Некорректный тип отметки.",
        )

    idx: int | None = None
    if commitment_index is not None and str(commitment_index).strip() != "":
        try:
            idx = int(commitment_index)
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail="Номер поручения — целое число или пусто.",
            ) from e
        if idx < 0:
            raise HTTPException(
                status_code=400,
                detail="Номер поручения не может быть отрицательным.",
            )

    resolved_photo_url = (photo_url or "").strip() or None
    if photo is not None and photo.filename:
        resolved_photo_url = _save_photo(photo)

    try:
        body = PublicObservationBody.model_validate(
            {
                "observation_type": observation_type,
                "commitment_index": idx,
                "note": note,
                "photo_url": resolved_photo_url,
                "website": "",
            }
        )
    except ValidationError:
        raise HTTPException(
            status_code=400,
            detail="Проверьте поля формы (комментарий, ссылка).",
        ) from None

    raw_name = human_voice.filename or "voice"
    suffix = Path(raw_name).suffix if Path(raw_name).suffix else ".webm"
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
            dir=settings.TEMP_AUDIO_DIR,
        ) as tmp:
            shutil.copyfileobj(human_voice.file, tmp)
            tmp_path = Path(tmp.name)

        if tmp_path.stat().st_size > _MAX_VOICE_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Запись слишком большая. Достаточно 2–5 секунд голоса.",
            )
        if tmp_path.stat().st_size < 256:
            raise HTTPException(
                status_code=400,
                detail="Запись слишком короткая. Нажмите «Запись» и произнесите фразу.",
            )

        soniox = build_soniox(settings)
        try:
            transcript, _tokens, _dur = soniox.transcribe_file(
                tmp_path,
                language=None,
            )
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Не удалось распознать речь. Повторите запись, говорите чётче.",
            ) from None

        normalized = soniox.normalize_transcript(transcript)
        combined = f"{transcript}\n{normalized}"
        if not transcript_confirms_not_robot(combined):
            raise HTTPException(
                status_code=400,
                detail="В записи должна быть фраза «я не робот». Запишите снова.",
            )
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    observer = account if (account and account.get("role") == "citizen") else None
    try:
        return svc.add_public_observation(session_id, body, observer=observer)
    except ValueError as e:
        code = str(e)
        if code == "session_not_public":
            raise HTTPException(status_code=404, detail=code) from e
        if code == "commitment_index_out_of_range":
            raise HTTPException(status_code=400, detail=code) from e
        raise HTTPException(status_code=400, detail=code) from e

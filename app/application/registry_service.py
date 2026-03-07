import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.application.analysis_service import AnalysisService
from app.application.evidence import enrich_extracted_items
from app.domain.models import PublicObservationBody, PublishSessionBody
from app.infrastructure.persistence.redis_registry import RedisRegistry


def _title_from_payload(payload: dict[str, Any]) -> str:
    kp = payload.get("key_points")
    if isinstance(kp, list) and kp and isinstance(kp[0], str):
        t = kp[0].strip()
        return (t[:160] + "…") if len(t) > 160 else t
    s = (payload.get("summary") or "").strip()
    if s:
        return (s[:160] + "…") if len(s) > 160 else s
    return "Анализ без заголовка"


def _commitment_counts(payload: dict[str, Any]) -> tuple[int, int]:
    com = payload.get("commitments")
    if not isinstance(com, list):
        return 0, 0
    total = len(com)
    verified = sum(
        1 for c in com if isinstance(c, dict) and c.get("evidence_verified") is True
    )
    return total, verified


def _sort_observations(obs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Photo-attached observations first, then by created_at descending."""
    return sorted(obs, key=lambda o: (not o.get("has_photo", False), o.get("created_at", "")))


def calculate_rating(observations: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate org rating from observations.

    Returns {"level": "green"|"yellow"|"red", "score": 0-100,
             "total": N, "positive": N, "negative": N, "neutral": N}.
    """
    if not observations:
        return {"level": "yellow", "score": 50, "total": 0,
                "positive": 0, "negative": 0, "neutral": 0}

    positive = sum(1 for o in observations if o.get("observation_type") == "work_done")
    negative = sum(1 for o in observations if o.get("observation_type") == "dispute")
    neutral = sum(1 for o in observations if o.get("observation_type") == "was_there")
    total = len(observations)

    photo_bonus = sum(1 for o in observations if o.get("has_photo"))
    weighted_positive = positive + sum(
        0.5 for o in observations
        if o.get("observation_type") == "work_done" and o.get("has_photo")
    )
    weighted_negative = negative + sum(
        0.5 for o in observations
        if o.get("observation_type") == "dispute" and o.get("has_photo")
    )
    weighted_total = total + photo_bonus * 0.5

    if weighted_total == 0:
        score = 50
    else:
        score = int(((weighted_positive - weighted_negative) / weighted_total + 1) * 50)
    score = max(0, min(100, score))

    if total < 3:
        level = "yellow"
    elif score >= 65:
        level = "green"
    elif score <= 35:
        level = "red"
    else:
        level = "yellow"

    return {
        "level": level,
        "score": score,
        "total": total,
        "positive": positive,
        "negative": negative,
        "neutral": neutral,
    }


def build_public_view(doc: dict[str, Any]) -> dict[str, Any]:
    pl = doc.get("payload") or {}
    commitments = pl.get("commitments") if isinstance(pl.get("commitments"), list) else []
    obs = doc.get("observations") or []
    sorted_obs = _sort_observations(obs)
    rating = calculate_rating(obs)
    return {
        "id": doc["id"],
        "title": doc.get("title"),
        "public_org": doc.get("public_org"),
        "city": doc.get("city"),
        "region": doc.get("region"),
        "created_at": doc.get("created_at"),
        "published_at": doc.get("published_at"),
        "summary": pl.get("summary"),
        "duration_seconds": pl.get("duration_seconds"),
        "language_detected": pl.get("language_detected"),
        "commitments": commitments,
        "observations": sorted_obs,
        "rating": rating,
        "normalized_transcript": pl.get("normalized_transcript") or pl.get("transcript"),
    }


class RegistryService:
    """Сохранение завершённого анализа в Redis-реестр + публикация + народные наблюдения."""

    def __init__(self, analysis: AnalysisService, store: RedisRegistry):
        self._analysis = analysis
        self._store = store

    def import_task(
        self,
        task_id: str,
        *,
        analysis_type: str | None = None,
        title_override: str | None = None,
        user: dict[str, Any] | None = None,
    ) -> tuple[str, bool]:
        existing = self._store.find_session_by_task(task_id)
        if existing:
            return existing, True

        status = self._analysis.get_job_status(task_id)
        if status.status != "completed" or not status.result:
            raise ValueError("Задача ещё не завершена или без результата")

        enriched = enrich_extracted_items(status.result)
        title = (title_override or "").strip() or _title_from_payload(enriched)
        atype = (analysis_type or "").strip() or "general"

        user_org = user.get("org") if user else None
        city, region = self._resolve_org_location(user_org) if user_org else (None, None)
        if not city and user:
            city, region = user.get("city"), user.get("region")

        document: dict[str, Any] = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "title": title,
            "analysis_type": atype,
            "payload": enriched,
            "published": False,
            "public_org": user_org,
            "city": city,
            "region": region,
            "published_at": None,
            "observations": [],
        }
        sid = self._store.save_session(task_id, document)
        return sid, False

    def _resolve_org_location(self, org_name: str) -> tuple[str | None, str | None]:
        """Find city/region for an org by looking up akim profiles."""
        if not org_name:
            return None, None
        target = org_name.lower().strip()
        for u in self._store.list_users():
            if u.get("role") in ("akim", "admin") and (u.get("org") or "").lower().strip() == target:
                return u.get("city"), u.get("region")
        return None, None

    def set_published(
        self, session_id: str, body: PublishSessionBody, *, user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        doc = self._store.get_session(session_id)
        if not doc:
            raise ValueError("session_not_found")
        doc.setdefault("observations", [])
        doc.setdefault("published", False)
        doc["published"] = body.published
        org = (body.public_org or "").strip()
        if not org and user and user.get("org"):
            org = user["org"]
        doc["public_org"] = org or None
        city, region = self._resolve_org_location(org)
        if city:
            doc["city"] = city
            doc["region"] = region
        elif user:
            doc["city"] = user.get("city") or doc.get("city")
            doc["region"] = user.get("region") or doc.get("region")
        if body.published:
            doc["published_at"] = datetime.now(timezone.utc).isoformat()
        else:
            doc["published_at"] = None
        self._store.set_published(session_id, body.published)
        self._store.save_document(session_id, doc)
        return doc

    def list_sessions(self, *, skip: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        docs = self._store.list_session_documents(skip=skip, limit=limit)
        rows = []
        for doc in docs:
            pl = doc.get("payload") or {}
            ct, cv = _commitment_counts(pl)
            rows.append(
                {
                    "id": doc["id"],
                    "task_id": doc["task_id"],
                    "created_at": doc["created_at"],
                    "title": doc.get("title") or "",
                    "analysis_type": doc.get("analysis_type") or "general",
                    "commitments_total": ct,
                    "commitments_verified_quotes": cv,
                    "published": bool(doc.get("published")),
                    "public_org": doc.get("public_org"),
                }
            )
        return rows

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        return self._store.get_session(session_id)

    def list_public_sessions(self, *, skip: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        ids = self._store.list_published_ids(skip=0, limit=500)
        out: list[dict[str, Any]] = []
        for sid in ids:
            doc = self._store.get_session(sid)
            if not doc or not doc.get("published"):
                continue
            pl = doc.get("payload") or {}
            com = pl.get("commitments")
            ncom = len(com) if isinstance(com, list) else 0
            obs = doc.get("observations") or []
            nobs = len(obs) if isinstance(obs, list) else 0
            rating = calculate_rating(obs)
            has_photo_count = sum(1 for o in obs if isinstance(o, dict) and o.get("has_photo"))
            out.append(
                {
                    "id": doc["id"],
                    "created_at": doc["created_at"],
                    "title": doc.get("title") or "",
                    "public_org": doc.get("public_org"),
                    "city": doc.get("city"),
                    "region": doc.get("region"),
                    "commitments_total": ncom,
                    "observations_total": nobs,
                    "observations_with_photo": has_photo_count,
                    "rating": rating,
                }
            )

        rating_order = {"red": 0, "yellow": 1, "green": 2}
        out.sort(key=lambda s: (
            rating_order.get(s["rating"]["level"], 1),
            -s["observations_total"],
        ))

        return out[skip:skip + limit]

    def get_public_session(self, session_id: str) -> Optional[dict[str, Any]]:
        doc = self._store.get_session(session_id)
        if not doc or not doc.get("published"):
            return None
        return build_public_view(doc)

    def add_public_observation(
        self,
        session_id: str,
        body: PublicObservationBody,
    ) -> dict[str, Any]:
        doc = self._store.get_session(session_id)
        if not doc or not doc.get("published"):
            raise ValueError("session_not_public")
        pl = doc.get("payload") or {}
        com = pl.get("commitments")
        if not isinstance(com, list):
            com = []
        if body.commitment_index is not None and body.commitment_index >= len(com):
            raise ValueError("commitment_index_out_of_range")
        obs = list(doc.get("observations") or [])
        entry = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "observation_type": body.observation_type,
            "commitment_index": body.commitment_index,
            "note": (body.note or "").strip() or None,
            "photo_url": (body.photo_url or "").strip() or None,
            "has_photo": bool((body.photo_url or "").strip()),
        }
        obs.append(entry)
        doc["observations"] = obs
        self._store.save_document(session_id, doc)
        return entry

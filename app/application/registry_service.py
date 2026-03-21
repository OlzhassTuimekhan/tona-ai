import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from app.application.analysis_service import AnalysisService
from app.application.evidence import enrich_extracted_items
from app.application.role_policy import OPERATOR_ROLES
from app.domain.models import PublicObservationBody, PublishSessionBody
from app.infrastructure.persistence.protocol import RegistryStore

_MONTHS_RU = {
    "январ": 1, "феврал": 2, "март": 3, "марта": 3,
    "апрел": 4, "ма": 5, "мая": 5, "июн": 6, "июл": 7,
    "август": 8, "сентябр": 9, "октябр": 10, "ноябр": 11, "декабр": 12,
}

_RE_DMY = re.compile(r"(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})")
_RE_TEXT = re.compile(
    r"(\d{1,2})\s+"
    r"(январ\w*|феврал\w*|марта?|апрел\w*|ма[яй]|июн\w*|июл\w*|август\w*|сентябр\w*|октябр\w*|ноябр\w*|декабр\w*)"
    r"(?:\s+(\d{4}))?",
    re.IGNORECASE,
)


def _parse_deadline_date(raw: str | None) -> date | None:
    """Best-effort parse of free-form deadline string into a date."""
    if not raw or not raw.strip():
        return None
    s = raw.strip()
    m = _RE_DMY.search(s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d)
        except ValueError:
            pass
    m = _RE_TEXT.search(s)
    if m:
        day = int(m.group(1))
        month_key = m.group(2).lower()[:4]
        month = next((v for k, v in _MONTHS_RU.items() if month_key.startswith(k[:3])), None)
        year = int(m.group(3)) if m.group(3) else date.today().year
        if month:
            try:
                return date(year, month, day)
            except ValueError:
                pass
    return None


def _deadline_status(raw: str | None, fulfillment: str | None = None) -> str:
    """Return 'fulfilled' | 'overdue' | 'upcoming' | 'ok' | 'no_deadline'.

    If the commitment is already marked fulfilled, always return 'fulfilled'.
    """
    if fulfillment == "fulfilled":
        return "fulfilled"
    parsed = _parse_deadline_date(raw)
    if parsed is None:
        return "no_deadline"
    today = date.today()
    if parsed < today:
        return "overdue"
    delta = (parsed - today).days
    if delta <= 7:
        return "upcoming"
    return "ok"


def _enrich_commitments_deadlines(commitments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add deadline_status and deadline_date fields to each commitment."""
    out = []
    for c in commitments:
        if not isinstance(c, dict):
            out.append(c)
            continue
        raw = c.get("deadline")
        fulfillment = c.get("fulfillment_status")
        status = _deadline_status(raw, fulfillment)
        parsed = _parse_deadline_date(raw)
        out.append({
            **c,
            "deadline_status": status,
            "deadline_date": parsed.isoformat() if parsed else None,
            "fulfillment_status": fulfillment or "pending",
        })
    return out


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


def calculate_rating(
    observations: list[dict[str, Any]],
    commitments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Calculate org rating from observations + commitment fulfillment.

    Returns {"level": "green"|"yellow"|"red", "score": 0-100,
             "total": N, "positive": N, "negative": N, "neutral": N,
             "overdue_penalty": N, "fulfilled_bonus": N}.
    """
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

    overdue_penalty = 0
    fulfilled_bonus = 0
    if commitments:
        for c in commitments:
            if not isinstance(c, dict):
                continue
            fs = c.get("fulfillment_status")
            ds = _deadline_status(c.get("deadline"), fs)
            if ds == "overdue":
                overdue_penalty += 1
            elif fs == "fulfilled":
                fulfilled_bonus += 1

    if weighted_total == 0 and overdue_penalty == 0 and fulfilled_bonus == 0:
        score = 50
    else:
        base = weighted_total or 1
        raw = ((weighted_positive + fulfilled_bonus * 0.3 - weighted_negative - overdue_penalty * 0.5) / base + 1) * 50
        score = int(raw)
    score = max(0, min(100, score))

    has_data = total >= 3 or overdue_penalty > 0 or fulfilled_bonus > 0
    if not has_data:
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
        "overdue_penalty": overdue_penalty,
        "fulfilled_bonus": fulfilled_bonus,
    }


def build_public_view(doc: dict[str, Any]) -> dict[str, Any]:
    pl = doc.get("payload") or {}
    commitments = pl.get("commitments") if isinstance(pl.get("commitments"), list) else []
    enriched_commitments = _enrich_commitments_deadlines(commitments)
    obs = doc.get("observations") or []
    sorted_obs = _sort_observations(obs)
    rating = calculate_rating(obs, commitments)

    overdue = sum(1 for c in enriched_commitments if isinstance(c, dict) and c.get("deadline_status") == "overdue")
    upcoming = sum(1 for c in enriched_commitments if isinstance(c, dict) and c.get("deadline_status") == "upcoming")

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
        "commitments": enriched_commitments,
        "observations": sorted_obs,
        "rating": rating,
        "normalized_transcript": pl.get("normalized_transcript") or pl.get("transcript"),
        "deadlines_overdue": overdue,
        "deadlines_upcoming": upcoming,
    }


class RegistryService:
    """Сохранение завершённого анализа в Redis-реестр + публикация + народные наблюдения."""

    def __init__(self, analysis: AnalysisService, store: RegistryStore):
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
        """Find city/region for an org by looking up operator profiles."""
        if not org_name:
            return None, None
        target = org_name.lower().strip()
        for u in self._store.list_users():
            if u.get("role") in (*OPERATOR_ROLES, "admin") and (u.get("org") or "").lower().strip() == target:
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
            com_list = com if isinstance(com, list) else []
            ncom = len(com_list)
            obs = doc.get("observations") or []
            nobs = len(obs) if isinstance(obs, list) else 0
            rating = calculate_rating(obs, com_list)
            has_photo_count = sum(1 for o in obs if isinstance(o, dict) and o.get("has_photo"))
            overdue = sum(
                1 for c in com_list
                if isinstance(c, dict) and _deadline_status(c.get("deadline"), c.get("fulfillment_status")) == "overdue"
            )
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
                    "deadlines_overdue": overdue,
                }
            )

        rating_order = {"red": 0, "yellow": 1, "green": 2}
        out.sort(key=lambda s: (
            rating_order.get(s["rating"]["level"], 1),
            -s["observations_total"],
        ))

        return out[skip:skip + limit]

    def get_aggregate_stats(self) -> dict[str, int]:
        """Aggregate stats across all published sessions."""
        ids = self._store.list_published_ids(skip=0, limit=500)
        total_sessions = 0
        total_commitments = 0
        total_observations = 0
        total_overdue = 0
        for sid in ids:
            doc = self._store.get_session(sid)
            if not doc or not doc.get("published"):
                continue
            total_sessions += 1
            pl = doc.get("payload") or {}
            com = pl.get("commitments")
            com_list = com if isinstance(com, list) else []
            total_commitments += len(com_list)
            obs = doc.get("observations") or []
            total_observations += len(obs) if isinstance(obs, list) else 0
            total_overdue += sum(
                1 for c in com_list
                if isinstance(c, dict) and _deadline_status(c.get("deadline"), c.get("fulfillment_status")) == "overdue"
            )
        return {
            "sessions": total_sessions,
            "commitments": total_commitments,
            "observations": total_observations,
            "overdue": total_overdue,
        }

    def get_public_session(self, session_id: str) -> Optional[dict[str, Any]]:
        doc = self._store.get_session(session_id)
        if not doc or not doc.get("published"):
            return None
        return build_public_view(doc)

    def set_commitment_status(
        self, session_id: str, commitment_index: int, status: str,
        *, user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Mark a commitment as fulfilled or revert to pending."""
        if status not in ("fulfilled", "pending"):
            raise ValueError("invalid_status")
        doc = self._store.get_session(session_id)
        if not doc:
            raise ValueError("session_not_found")
        pl = doc.get("payload") or {}
        com = pl.get("commitments")
        if not isinstance(com, list) or commitment_index >= len(com) or commitment_index < 0:
            raise ValueError("commitment_index_out_of_range")
        item = com[commitment_index]
        if not isinstance(item, dict):
            raise ValueError("commitment_index_out_of_range")
        item["fulfillment_status"] = status
        item["fulfilled_at"] = datetime.now(timezone.utc).isoformat() if status == "fulfilled" else None
        item["fulfilled_by"] = user.get("username") if user and status == "fulfilled" else None
        pl["commitments"] = com
        doc["payload"] = pl
        self._store.save_document(session_id, doc)
        return {
            "commitment_index": commitment_index,
            "fulfillment_status": status,
            "fulfilled_at": item.get("fulfilled_at"),
            "fulfilled_by": item.get("fulfilled_by"),
        }

    def add_public_observation(
        self,
        session_id: str,
        body: PublicObservationBody,
        *,
        observer: dict[str, Any] | None = None,
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
        if observer and observer.get("role") == "citizen":
            fn = (observer.get("first_name") or "").strip()
            ln = (observer.get("last_name") or "").strip()
            display = f"{fn} {ln}".strip() or observer.get("username", "")
            entry["registered_user_id"] = observer.get("id")
            entry["observer_display"] = display
            entry["observer_district"] = observer.get("district")
        obs.append(entry)
        doc["observations"] = obs
        self._store.save_document(session_id, doc)
        return entry

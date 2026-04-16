from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.infrastructure.persistence.db import get_engine, get_session_factory
from app.infrastructure.persistence.orm_models import Base, RegistrySessionRow, UserRow

_KNOWN_USER_COLS = frozenset(
    {
        "id",
        "username",
        "password_hash",
        "role",
        "org",
        "city",
        "region",
        "first_name",
        "last_name",
        "district",
        "phone",
        "created_at",
    }
)


def _parse_iso_ts(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        s = value.replace("Z", "+00:00") if value.endswith("Z") else value
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)


def _user_row_to_dict(row: UserRow) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(row.id),
        "username": row.username,
        "password_hash": row.password_hash,
        "role": row.role,
        "org": row.org,
        "city": row.city,
        "region": row.region,
        "first_name": row.first_name,
        "last_name": row.last_name,
        "district": row.district,
        "phone": row.phone,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
    ex = row.extra or {}
    for k, v in ex.items():
        if k not in out or out[k] is None:
            out[k] = v
    return out


def _dict_to_user_parts(d: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    extra = {k: v for k, v in d.items() if k not in _KNOWN_USER_COLS}
    base = {k: v for k, v in d.items() if k in _KNOWN_USER_COLS and k != "id"}
    return base, extra


class PostgresRegistry:
    def __init__(self, settings: Settings):
        self._settings = settings
        get_engine()

    def _sess(self) -> Session:
        return get_session_factory()()

    def ping(self) -> bool:
        try:
            s = self._sess()
            try:
                s.execute(text("SELECT 1"))
                return True
            finally:
                s.close()
        except Exception:
            return False

    def init_schema(self) -> None:
        Base.metadata.create_all(bind=get_engine())

    def find_session_by_task(self, task_id: str) -> Optional[str]:
        s = self._sess()
        try:
            row = s.execute(
                select(RegistrySessionRow.id).where(RegistrySessionRow.task_id == task_id)
            ).scalar_one_or_none()
            return str(row) if row else None
        finally:
            s.close()

    def save_session(self, task_id: str, document: dict[str, Any]) -> str:
        sid = str(uuid.uuid4())
        document = {**document, "id": sid, "task_id": task_id}
        sort_ts = _parse_iso_ts(str(document.get("created_at") or ""))
        s = self._sess()
        try:
            row = RegistrySessionRow(
                id=uuid.UUID(sid),
                task_id=task_id,
                document=document,
                sort_ts=sort_ts,
                published=bool(document.get("published")),
                published_ts=_parse_iso_ts(str(document.get("published_at") or ""))
                if document.get("published")
                else None,
            )
            s.add(row)
            s.commit()
            return sid
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        s = self._sess()
        try:
            uid = uuid.UUID(session_id)
            row = s.get(RegistrySessionRow, uid)
            if not row:
                return None
            return dict(row.document)
        finally:
            s.close()

    def list_session_ids(self, *, skip: int = 0, limit: int = 50) -> list[str]:
        s = self._sess()
        try:
            rows = s.execute(
                select(RegistrySessionRow.id)
                .order_by(RegistrySessionRow.sort_ts.desc())
                .offset(skip)
                .limit(limit)
            ).scalars()
            return [str(r) for r in rows.all()]
        finally:
            s.close()

    def count_sessions(self) -> int:
        s = self._sess()
        try:
            return int(
                s.execute(select(func.count()).select_from(RegistrySessionRow)).scalar_one()
            )
        finally:
            s.close()

    def list_session_documents(self, *, skip: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        ids = self.list_session_ids(skip=skip, limit=limit)
        if not ids:
            return []
        s = self._sess()
        try:
            uuids = [uuid.UUID(i) for i in ids]
            rows = s.execute(select(RegistrySessionRow).where(RegistrySessionRow.id.in_(uuids))).scalars().all()
            by_id = {str(r.id): dict(r.document) for r in rows}
            return [by_id[i] for i in ids if i in by_id]
        finally:
            s.close()

    def save_document(self, session_id: str, document: dict[str, Any]) -> None:
        if document.get("id") != session_id:
            document = {**document, "id": session_id}
        uid = uuid.UUID(session_id)
        s = self._sess()
        try:
            row = s.get(RegistrySessionRow, uid)
            if not row:
                return
            row.document = document
            row.sort_ts = _parse_iso_ts(str(document.get("created_at") or "")) or row.sort_ts
            row.published = bool(document.get("published"))
            row.published_ts = (
                _parse_iso_ts(str(document.get("published_at") or ""))
                if document.get("published")
                else None
            )
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def list_published_ids(self, *, skip: int = 0, limit: int = 50) -> list[str]:
        s = self._sess()
        try:
            order_col = func.coalesce(
                RegistrySessionRow.published_ts,
                RegistrySessionRow.sort_ts,
            )
            rows = s.execute(
                select(RegistrySessionRow.id)
                .where(RegistrySessionRow.published.is_(True))
                .order_by(order_col.desc())
                .offset(skip)
                .limit(limit)
            ).scalars()
            return [str(r) for r in rows.all()]
        finally:
            s.close()

    def set_published(self, session_id: str, published: bool) -> None:
        uid = uuid.UUID(session_id)
        s = self._sess()
        try:
            row = s.get(RegistrySessionRow, uid)
            if not row:
                return
            now = datetime.now(timezone.utc)
            doc = dict(row.document)
            doc["published"] = published
            doc["published_at"] = now.isoformat() if published else None
            row.document = doc
            row.published = published
            row.published_ts = now if published else None
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def save_user(self, user: dict[str, Any]) -> str:
        base, extra = _dict_to_user_parts(user)
        created = _parse_iso_ts(str(user.get("created_at") or ""))

        s = self._sess()
        try:
            row = s.scalars(select(UserRow).where(UserRow.username == user["username"])).first()
            if row:
                row.password_hash = user["password_hash"]
                row.role = user.get("role", "citizen")
                row.org = base.get("org")
                row.city = base.get("city")
                row.region = base.get("region")
                row.first_name = base.get("first_name")
                row.last_name = base.get("last_name")
                row.district = base.get("district")
                row.phone = base.get("phone")
                row.created_at = created
                row.extra = {**(row.extra or {}), **extra}
                s.commit()
                return str(row.id)

            uid_str = user.get("id") or str(uuid.uuid4())
            uid = uuid.UUID(uid_str)
            row = UserRow(
                id=uid,
                username=user["username"],
                password_hash=user["password_hash"],
                role=user.get("role", "citizen"),
                org=base.get("org"),
                city=base.get("city"),
                region=base.get("region"),
                first_name=base.get("first_name"),
                last_name=base.get("last_name"),
                district=base.get("district"),
                phone=base.get("phone"),
                created_at=created,
                extra=extra,
            )
            s.add(row)
            s.commit()
            return uid_str
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def get_user(self, user_id: str) -> Optional[dict[str, Any]]:
        s = self._sess()
        try:
            row = s.get(UserRow, uuid.UUID(user_id))
            return _user_row_to_dict(row) if row else None
        finally:
            s.close()

    def get_user_by_username(self, username: str) -> Optional[dict[str, Any]]:
        s = self._sess()
        try:
            row = s.scalars(select(UserRow).where(UserRow.username == username)).first()
            return _user_row_to_dict(row) if row else None
        finally:
            s.close()

    def list_users(self) -> list[dict[str, Any]]:
        s = self._sess()
        try:
            rows = s.scalars(select(UserRow).order_by(UserRow.created_at.asc())).all()
            return [_user_row_to_dict(r) for r in rows]
        finally:
            s.close()

    def delete_user(self, user_id: str) -> bool:
        s = self._sess()
        try:
            uid = uuid.UUID(user_id)
            row = s.get(UserRow, uid)
            if not row:
                return False
            s.delete(row)
            s.commit()
            return True
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def update_user_fields(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        user = self.get_user(user_id)
        if not user:
            return None
        blocked = {"id", "username", "password_hash", "role", "created_at"}
        clean = {k: v for k, v in updates.items() if k not in blocked}
        merged = {**user, **clean}
        base, extra = _dict_to_user_parts(merged)
        uid = uuid.UUID(user_id)
        s = self._sess()
        try:
            row = s.get(UserRow, uid)
            if not row:
                return None
            for k in ("org", "city", "region", "first_name", "last_name", "district", "phone"):
                if k in base:
                    setattr(row, k, base[k])
            row.extra = {**(row.extra or {}), **extra}
            for k, v in clean.items():
                if k not in _KNOWN_USER_COLS and k != "id":
                    row.extra[k] = v
            s.commit()
            return self.get_user(user_id)
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    def upsert_session_from_migrate(self, document: dict[str, Any]) -> None:
        sid = document.get("id")
        tid = document.get("task_id")
        if not sid or not tid:
            raise ValueError("document must have id and task_id")
        uid = uuid.UUID(str(sid))
        sort_ts = _parse_iso_ts(str(document.get("created_at") or ""))
        pub = bool(document.get("published"))
        pub_ts = (
            _parse_iso_ts(str(document.get("published_at") or ""))
            if document.get("published_at")
            else None
        )
        row = RegistrySessionRow(
            id=uid,
            task_id=str(tid),
            document=document,
            sort_ts=sort_ts,
            published=pub,
            published_ts=pub_ts,
        )
        s = self._sess()
        try:
            s.merge(row)
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

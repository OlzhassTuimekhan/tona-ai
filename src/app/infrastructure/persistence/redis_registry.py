import json
import time
import uuid
from typing import Any, Optional

import redis

from app.core.config import Settings, registry_redis_url


class RedisRegistry:
    def __init__(self, settings: Settings):
        self._r = redis.from_url(registry_redis_url(settings), decode_responses=True)
        self._p = "jois:registry:"

    def ping(self) -> bool:
        try:
            return bool(self._r.ping())
        except redis.RedisError:
            return False

    def find_session_by_task(self, task_id: str) -> Optional[str]:
        return self._r.get(f"{self._p}by_task:{task_id}")

    def save_session(self, task_id: str, document: dict[str, Any]) -> str:
        sid = str(uuid.uuid4())
        document = {**document, "id": sid, "task_id": task_id}
        key = f"{self._p}session:{sid}"
        pipe = self._r.pipeline()
        pipe.set(key, json.dumps(document, ensure_ascii=False))
        pipe.set(f"{self._p}by_task:{task_id}", sid)
        pipe.zadd(f"{self._p}index", {sid: time.time()})
        pipe.execute()
        return sid

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        raw = self._r.get(f"{self._p}session:{session_id}")
        if not raw:
            return None
        return json.loads(raw)

    def list_session_ids(self, *, skip: int = 0, limit: int = 50) -> list[str]:
        ids = self._r.zrevrange(f"{self._p}index", skip, skip + limit - 1)
        return list(ids)

    def count_sessions(self) -> int:
        return int(self._r.zcard(f"{self._p}index"))

    def list_session_documents(self, *, skip: int = 0, limit: int = 50) -> list[dict[str, Any]]:
        ids = self.list_session_ids(skip=skip, limit=limit)
        if not ids:
            return []
        keys = [f"{self._p}session:{i}" for i in ids]
        out: list[dict[str, Any]] = []
        for raw in self._r.mget(keys):
            if raw:
                out.append(json.loads(raw))
        return out

    def save_document(self, session_id: str, document: dict[str, Any]) -> None:
        key = f"{self._p}session:{session_id}"
        if document.get("id") != session_id:
            document = {**document, "id": session_id}
        self._r.set(key, json.dumps(document, ensure_ascii=False))

    def list_published_ids(self, *, skip: int = 0, limit: int = 50) -> list[str]:
        return list(self._r.zrevrange(f"{self._p}published", skip, skip + limit - 1))

    def set_published(self, session_id: str, published: bool) -> None:
        zkey = f"{self._p}published"
        if published:
            self._r.zadd(zkey, {session_id: time.time()})
        else:
            self._r.zrem(zkey, session_id)

    # ── User CRUD ──

    _UP = "jois:user:"

    def save_user(self, user: dict[str, Any]) -> str:
        uid = user.get("id") or str(uuid.uuid4())
        user = {**user, "id": uid}
        pipe = self._r.pipeline()
        pipe.set(f"{self._UP}{uid}", json.dumps(user, ensure_ascii=False))
        pipe.set(f"{self._UP}by_username:{user['username']}", uid)
        pipe.sadd(f"{self._UP}index", uid)
        pipe.execute()
        return uid

    def get_user(self, user_id: str) -> Optional[dict[str, Any]]:
        raw = self._r.get(f"{self._UP}{user_id}")
        return json.loads(raw) if raw else None

    def get_user_by_username(self, username: str) -> Optional[dict[str, Any]]:
        uid = self._r.get(f"{self._UP}by_username:{username}")
        if not uid:
            return None
        return self.get_user(uid)

    def list_users(self) -> list[dict[str, Any]]:
        ids = self._r.smembers(f"{self._UP}index")
        if not ids:
            return []
        keys = [f"{self._UP}{uid}" for uid in ids]
        out: list[dict[str, Any]] = []
        for raw in self._r.mget(keys):
            if raw:
                out.append(json.loads(raw))
        out.sort(key=lambda u: u.get("created_at", ""))
        return out

    def delete_user(self, user_id: str) -> bool:
        user = self.get_user(user_id)
        if not user:
            return False
        pipe = self._r.pipeline()
        pipe.delete(f"{self._UP}{user_id}")
        pipe.delete(f"{self._UP}by_username:{user['username']}")
        pipe.srem(f"{self._UP}index", user_id)
        pipe.execute()
        return True

    def update_user_fields(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        """Merge allowed fields into user document. Does not change username/id/role/password here."""
        user = self.get_user(user_id)
        if not user:
            return None
        blocked = {"id", "username", "password_hash", "role", "created_at"}
        clean = {k: v for k, v in updates.items() if k not in blocked}
        merged = {**user, **clean}
        self._r.set(f"{self._UP}{user_id}", json.dumps(merged, ensure_ascii=False))
        return merged

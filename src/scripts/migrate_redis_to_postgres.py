#!/usr/bin/env python3
"""One-off migration of registry users and sessions from Redis to PostgreSQL."""

from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent.parent
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))


def main() -> None:
    from app.core.config import settings
    from app.infrastructure.persistence.postgres_registry import PostgresRegistry
    from app.infrastructure.persistence.redis_registry import RedisRegistry

    if not (settings.DATABASE_URL or "").strip():
        print("ERROR: set DATABASE_URL for PostgreSQL.", file=sys.stderr)
        sys.exit(1)

    r = RedisRegistry(settings)
    if not r.ping():
        print("ERROR: Redis unreachable (check REGISTRY_REDIS_URL / CELERY_BROKER_URL).", file=sys.stderr)
        sys.exit(1)

    pg = PostgresRegistry(settings)
    pg.init_schema()

    users = r.list_users()
    print(f"Users in Redis: {len(users)}")
    for u in users:
        pg.save_user(u)
    print("Users migrated.")

    n = r.count_sessions()
    print(f"Sessions in Redis: {n}")
    batch = 100
    skip = 0
    migrated = 0
    while True:
        docs = r.list_session_documents(skip=skip, limit=batch)
        if not docs:
            break
        for doc in docs:
            pg.upsert_session_from_migrate(doc)
            migrated += 1
        skip += batch
        print(f"  … {migrated} cards")

    print(f"Done. Total registry cards: {migrated}.")
    print("Set DATABASE_URL in .env for api and worker, then restart containers.")


if __name__ == "__main__":
    main()

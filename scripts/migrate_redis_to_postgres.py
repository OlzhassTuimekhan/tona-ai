#!/usr/bin/env python3
"""
Одноразовый перенос пользователей и карточек реестра из Redis в PostgreSQL.

Запуск из корня проекта jois-audio (где лежит app/ и .env):

  export DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/jois
  python scripts/migrate_redis_to_postgres.py

Нужен доступ к тем же REGISTRY_REDIS_URL / CELERY, что и у приложения.
Повторный запуск безопасен: строки в Postgres обновляются (merge по id).
"""

from __future__ import annotations

import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)


def main() -> None:
    from app.core.config import settings
    from app.infrastructure.persistence.postgres_registry import PostgresRegistry
    from app.infrastructure.persistence.redis_registry import RedisRegistry

    if not (settings.DATABASE_URL or "").strip():
        print("ERROR: задайте DATABASE_URL на PostgreSQL.", file=sys.stderr)
        sys.exit(1)

    r = RedisRegistry(settings)
    if not r.ping():
        print("ERROR: Redis недоступен (проверьте REGISTRY_REDIS_URL / CELERY_BROKER_URL).", file=sys.stderr)
        sys.exit(1)

    pg = PostgresRegistry(settings)
    pg.init_schema()

    users = r.list_users()
    print(f"Пользователей в Redis: {len(users)}")
    for u in users:
        pg.save_user(u)
    print("Пользователи перенесены.")

    n = r.count_sessions()
    print(f"Сессий в Redis: {n}")
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
        print(f"  … {migrated} карточек")

    print(f"Готово. Всего карточек реестра: {migrated}.")
    print("Дальше: пропишите DATABASE_URL в .env для api и worker и перезапустите контейнеры.")


if __name__ == "__main__":
    main()

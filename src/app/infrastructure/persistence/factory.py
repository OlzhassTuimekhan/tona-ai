from app.core.config import Settings
from app.infrastructure.persistence.postgres_registry import PostgresRegistry
from app.infrastructure.persistence.protocol import RegistryStore
from app.infrastructure.persistence.redis_registry import RedisRegistry


def get_registry_store(settings: Settings) -> RegistryStore:
    if (settings.DATABASE_URL or "").strip():
        return PostgresRegistry(settings)
    return RedisRegistry(settings)

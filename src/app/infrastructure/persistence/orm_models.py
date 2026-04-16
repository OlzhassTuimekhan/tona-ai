import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(64))
    org: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    region: Mapped[str | None] = mapped_column(String(200), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    district: Mapped[str | None] = mapped_column(String(300), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    extra: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))


class RegistrySessionRow(Base):
    __tablename__ = "registry_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    document: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sort_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    published_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

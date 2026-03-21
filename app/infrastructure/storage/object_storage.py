"""Опциональное хранение файлов в S3-совместимом хранилище (AWS S3, MinIO, и т.д.)."""

from __future__ import annotations

import uuid
from pathlib import Path
from urllib.parse import urlparse

from app.core.config import Settings


def s3_configured(settings: Settings) -> bool:
    return bool(
        (settings.S3_BUCKET or "").strip()
        and (settings.AWS_ACCESS_KEY_ID or "").strip()
        and (settings.AWS_SECRET_ACCESS_KEY or "").strip()
    )


def _client(settings: Settings):
    import boto3  # lazy

    kwargs: dict = {
        "region_name": (settings.S3_REGION or "us-east-1").strip(),
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID.strip(),
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY.strip(),
    }
    ep = (settings.S3_ENDPOINT_URL or "").strip()
    if ep:
        kwargs["endpoint_url"] = ep
    return boto3.client("s3", **kwargs)


def _public_url_for_key(settings: Settings, key: str) -> str:
    base = (settings.S3_PUBLIC_BASE_URL or "").strip().rstrip("/")
    if base:
        return f"{base}/{key}"
    bucket = settings.S3_BUCKET.strip()
    region = (settings.S3_REGION or "us-east-1").strip()
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def upload_file_to_s3(settings: Settings, local_path: Path, key: str) -> str:
    """Загружает файл, возвращает публичный URL (для фото в отзывах)."""
    cli = _client(settings)
    bucket = settings.S3_BUCKET.strip()
    extra = {}
    ctype = "application/octet-stream"
    suf = local_path.suffix.lower()
    if suf in (".jpg", ".jpeg"):
        ctype = "image/jpeg"
    elif suf == ".png":
        ctype = "image/png"
    elif suf == ".webp":
        ctype = "image/webp"
    elif suf == ".gif":
        ctype = "image/gif"
    extra["ContentType"] = ctype
    cli.upload_file(str(local_path), bucket, key, ExtraArgs=extra)
    return _public_url_for_key(settings, key)


def upload_job_audio_and_return_ref(settings: Settings, local_path: Path) -> str:
    """
    Загружает аудио для задачи Celery.
    Возвращает либо локальный путь (строка), либо s3://bucket/key для воркера.
    """
    if not s3_configured(settings):
        return str(local_path.resolve())
    key = f"jobs/{uuid.uuid4().hex}{local_path.suffix or '.bin'}"
    cli = _client(settings)
    bucket = settings.S3_BUCKET.strip()
    cli.upload_file(str(local_path), bucket, key)
    try:
        local_path.unlink(missing_ok=True)
    except OSError:
        pass
    return f"s3://{bucket}/{key}"


def download_s3_uri_to_temp(settings: Settings, uri: str, dest_dir: Path) -> Path:
    """s3://bucket/key → локальный файл во временной папке."""
    parsed = urlparse(uri)
    if parsed.scheme != "s3" or not parsed.netloc or not parsed.path.strip("/"):
        raise ValueError(f"invalid_s3_uri: {uri}")
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"dl-{uuid.uuid4().hex}{Path(key).suffix or '.bin'}"
    cli = _client(settings)
    cli.download_file(bucket, key, str(dest))
    return dest


def resolve_worker_audio_path(settings: Settings, file_path: str) -> Path:
    """Для воркера: локальный путь или скачивание из S3."""
    if file_path.startswith("s3://"):
        return download_s3_uri_to_temp(settings, file_path, settings.TEMP_AUDIO_DIR)
    return Path(file_path)

"""Точка входа Celery: `celery -A app.tasks:celery_app worker`."""

from app.infrastructure.worker.tasks import analyze_file, analyze_url, celery_app

__all__ = ["celery_app", "analyze_file", "analyze_url"]

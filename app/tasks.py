import asyncio
import tempfile
import logging
from pathlib import Path
from typing import Optional

from celery import Celery

from .config import settings
from .services.soniox import SonioxASR
from .services.llm import LLMAnalyzer
from .webhook import send_webhook

logger = logging.getLogger(__name__)

celery_app = Celery(
    "audio_jois",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    result_expires=86400,
)

soniox = SonioxASR(api_key=settings.SONIOX_API_KEY, max_duration_sec=settings.SONIOX_MAX_DURATION_SEC)
llm = LLMAnalyzer(
    api_key=settings.LLM_API_KEY,
    base_url=settings.LLM_BASE_URL,
    model=settings.LLM_MODEL,
    model_fast=settings.LLM_MODEL_FAST,
)


def _run_async(coro):
    return asyncio.run(coro)


@celery_app.task(name="analyze_file", bind=True)
def analyze_file(
    self,
    file_path: str,
    language: Optional[str] = None,
    analysis_type: str = "general",
    instructions: Optional[str] = None,
    webhook_url: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    task_id = self.request.id
    logger.info(f"[{task_id}] Starting file analysis: {file_path}")

    try:
        path = Path(file_path)
        transcript, tokens, duration = soniox.transcribe_file(path, language=language)
        normalized = soniox.normalize_transcript(transcript)
        logger.info(f"[{task_id}] Transcription done: {len(transcript)} chars, {duration:.0f}s")

        result = _run_async(llm.analyze(
            normalized,
            analysis_type=analysis_type,
            instructions=instructions,
            duration_seconds=duration,
            language=language,
        ))

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration
        result.metadata = {**(metadata or {}), "task_id": task_id, "source": "file"}

        payload = result.model_dump()

        if webhook_url:
            send_webhook(webhook_url, payload, settings.WEBHOOK_SECRET)

        logger.info(f"[{task_id}] Analysis complete")
        return payload

    except Exception as exc:
        logger.error(f"[{task_id}] Analysis failed: {exc}")
        error_payload = {
            "task_id": task_id,
            "status": "failed",
            "error": str(exc),
        }
        if webhook_url:
            send_webhook(webhook_url, error_payload, settings.WEBHOOK_SECRET)
        raise

    finally:
        try:
            p = Path(file_path)
            if p.exists() and str(settings.TEMP_AUDIO_DIR) in str(p):
                p.unlink()
        except Exception:
            pass


@celery_app.task(name="analyze_url", bind=True)
def analyze_url(
    self,
    audio_url: str,
    language: Optional[str] = None,
    analysis_type: str = "general",
    instructions: Optional[str] = None,
    webhook_url: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    task_id = self.request.id
    logger.info(f"[{task_id}] Starting URL analysis: {audio_url}")

    try:
        transcript, tokens, duration = soniox.transcribe_url(audio_url, language=language)
        normalized = soniox.normalize_transcript(transcript)
        logger.info(f"[{task_id}] Transcription done: {len(transcript)} chars, {duration:.0f}s")

        result = _run_async(llm.analyze(
            normalized,
            analysis_type=analysis_type,
            instructions=instructions,
            duration_seconds=duration,
            language=language,
        ))

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration
        result.metadata = {**(metadata or {}), "task_id": task_id, "source": "url", "audio_url": audio_url}

        payload = result.model_dump()

        if webhook_url:
            send_webhook(webhook_url, payload, settings.WEBHOOK_SECRET)

        logger.info(f"[{task_id}] Analysis complete")
        return payload

    except Exception as exc:
        logger.error(f"[{task_id}] Analysis failed: {exc}")
        error_payload = {
            "task_id": task_id,
            "status": "failed",
            "error": str(exc),
        }
        if webhook_url:
            send_webhook(webhook_url, error_payload, settings.WEBHOOK_SECRET)
        raise

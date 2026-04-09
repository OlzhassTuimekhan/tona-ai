import asyncio
import logging
import shutil
from pathlib import Path
from typing import Optional

from celery import Celery

from app.application.alignment import align_commitments_to_asr
from app.core.config import settings
from app.domain.models import Commitment, TranscriptSegment
from app.infrastructure.storage.object_storage import resolve_worker_audio_path
from app.infrastructure.asr.soniox import SonioxASR
from app.infrastructure.llm.llm_client import LLMAnalyzer
from app.infrastructure.webhooks import send_webhook

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

    path_resolved: Path | None = None
    try:
        path = resolve_worker_audio_path(settings, file_path)
        path_resolved = path
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

        segs = soniox.tokens_to_diarized_segments(tokens, duration_hint_sec=duration)
        result.transcript_segments = [TranscriptSegment.model_validate(s) for s in segs]
        wsegs = soniox.tokens_to_word_segments(tokens, duration_hint_sec=duration)
        result.transcript_word_segments = [TranscriptSegment.model_validate(s) for s in wsegs]

        playback_path: str | None = None
        if path_resolved is not None and path_resolved.exists():
            try:
                ext = path_resolved.suffix.lower() or ".wav"
                dest_name = f"job_audio_{task_id}{ext}"
                dest = settings.UPLOADS_DIR / dest_name
                shutil.copy2(path_resolved, dest)
                playback_path = f"/uploads/{dest_name}"
            except OSError as copy_err:
                logger.warning("[%s] playback copy failed: %s", task_id, copy_err)

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration
        result.metadata = {
            **(metadata or {}),
            "task_id": task_id,
            "source": "file",
            "playback_path": playback_path,
        }

        aligned_com = align_commitments_to_asr(
            result.commitments,
            result.transcript_segments,
            result.transcript_word_segments,
        )
        result.commitments = [Commitment(**a) for a in aligned_com]

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
            if path_resolved is not None and path_resolved.exists():
                if str(settings.TEMP_AUDIO_DIR.resolve()) in str(path_resolved.resolve()):
                    path_resolved.unlink(missing_ok=True)
            if not str(file_path).startswith("s3://"):
                p = Path(file_path)
                if p.exists() and str(settings.TEMP_AUDIO_DIR.resolve()) in str(p.resolve()):
                    p.unlink(missing_ok=True)
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

        segs = soniox.tokens_to_diarized_segments(tokens, duration_hint_sec=duration)
        result.transcript_segments = [TranscriptSegment.model_validate(s) for s in segs]
        wsegs = soniox.tokens_to_word_segments(tokens, duration_hint_sec=duration)
        result.transcript_word_segments = [TranscriptSegment.model_validate(s) for s in wsegs]

        au = str(audio_url).strip()
        playback_path = au if au.startswith(("http://", "https://")) else None

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration
        result.metadata = {
            **(metadata or {}),
            "task_id": task_id,
            "source": "url",
            "audio_url": audio_url,
            "playback_path": playback_path,
        }

        aligned_com = align_commitments_to_asr(
            result.commitments,
            result.transcript_segments,
            result.transcript_word_segments,
        )
        result.commitments = [Commitment(**a) for a in aligned_com]

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

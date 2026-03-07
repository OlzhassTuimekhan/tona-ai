from pathlib import Path
from typing import Any, Optional

from celery.result import AsyncResult

from app.application.factories import build_llm, build_soniox
from app.core.config import Settings
from app.domain.models import AnalyzeUrlRequest, JobCreatedResponse, JobStatusResponse
from app.infrastructure.worker.tasks import analyze_file, analyze_url, celery_app


class AnalysisService:
    """Прикладной слой: постановка задач в Celery и синхронный пайплайн (без воркера)."""

    def __init__(self, settings: Settings):
        self._settings = settings

    def enqueue_file_job(
        self,
        *,
        file_path: Path,
        language: Optional[str] = None,
        analysis_type: str = "general",
        instructions: Optional[str] = None,
        webhook_url: Optional[str] = None,
    ) -> JobCreatedResponse:
        task = analyze_file.delay(
            file_path=str(file_path),
            language=language,
            analysis_type=analysis_type,
            instructions=instructions,
            webhook_url=webhook_url,
        )
        return JobCreatedResponse(task_id=task.id)

    def enqueue_url_job(self, req: AnalyzeUrlRequest) -> JobCreatedResponse:
        task = analyze_url.delay(
            audio_url=req.audio_url,
            language=req.language,
            analysis_type=req.analysis_type,
            instructions=req.instructions,
            webhook_url=req.webhook_url,
            metadata=req.metadata,
        )
        return JobCreatedResponse(task_id=task.id)

    def get_job_status(self, task_id: str) -> JobStatusResponse:
        result = AsyncResult(task_id, app=celery_app)
        if result.state == "PENDING":
            return JobStatusResponse(task_id=task_id, status="pending")
        if result.state == "STARTED":
            return JobStatusResponse(task_id=task_id, status="processing")
        if result.state == "SUCCESS":
            return JobStatusResponse(task_id=task_id, status="completed", result=result.result)
        if result.state == "FAILURE":
            return JobStatusResponse(task_id=task_id, status="failed", error=str(result.info))
        return JobStatusResponse(task_id=task_id, status=result.state.lower())

    async def run_file_sync(
        self,
        file_path: Path,
        *,
        language: Optional[str] = None,
        analysis_type: str = "general",
        instructions: Optional[str] = None,
    ) -> dict[str, Any]:
        soniox = build_soniox(self._settings)
        llm = build_llm(self._settings)

        transcript, _tokens, duration = soniox.transcribe_file(file_path, language=language)
        normalized = soniox.normalize_transcript(transcript)

        result = await llm.analyze(
            normalized,
            analysis_type=analysis_type,
            instructions=instructions,
            duration_seconds=duration,
            language=language,
        )

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration

        return result.model_dump()

    async def run_url_sync(self, req: AnalyzeUrlRequest) -> dict[str, Any]:
        soniox = build_soniox(self._settings)
        llm = build_llm(self._settings)

        transcript, _tokens, duration = soniox.transcribe_url(req.audio_url, language=req.language)
        normalized = soniox.normalize_transcript(transcript)

        result = await llm.analyze(
            normalized,
            analysis_type=req.analysis_type,
            instructions=req.instructions,
            duration_seconds=duration,
            language=req.language,
        )

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration
        result.metadata = req.metadata or {}

        return result.model_dump()

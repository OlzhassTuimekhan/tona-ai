import uuid
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from celery.result import AsyncResult

from .config import settings
from .models import AnalyzeUrlRequest, TaskResponse
from .tasks import celery_app, analyze_file, analyze_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

app = FastAPI(
    title="Audio JOIS",
    description="Universal audio analysis service: ASR + LLM",
    version="1.0.0",
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "audio-jois"}


@app.post("/analyze/file", response_model=TaskResponse, status_code=202)
async def analyze_audio_file(
    file: UploadFile = File(...),
    language: str = Form(None),
    analysis_type: str = Form("general"),
    instructions: str = Form(None),
    webhook_url: str = Form(None),
):
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    temp_path = settings.TEMP_AUDIO_DIR / f"{uuid.uuid4()}{suffix}"
    content = await file.read()
    temp_path.write_bytes(content)

    task = analyze_file.delay(
        file_path=str(temp_path),
        language=language,
        analysis_type=analysis_type,
        instructions=instructions,
        webhook_url=webhook_url,
    )

    return TaskResponse(task_id=task.id)


@app.post("/analyze/url", response_model=TaskResponse, status_code=202)
def analyze_audio_url(req: AnalyzeUrlRequest):
    task = analyze_url.delay(
        audio_url=req.audio_url,
        language=req.language,
        analysis_type=req.analysis_type,
        instructions=req.instructions,
        webhook_url=req.webhook_url,
        metadata=req.metadata,
    )

    return TaskResponse(task_id=task.id)


@app.get("/results/{task_id}")
def get_result(task_id: str):
    result = AsyncResult(task_id, app=celery_app)

    if result.state == "PENDING":
        return {"task_id": task_id, "status": "pending"}
    elif result.state == "STARTED":
        return {"task_id": task_id, "status": "processing"}
    elif result.state == "SUCCESS":
        return {"task_id": task_id, "status": "completed", "result": result.result}
    elif result.state == "FAILURE":
        return {"task_id": task_id, "status": "failed", "error": str(result.info)}
    else:
        return {"task_id": task_id, "status": result.state.lower()}


@app.post("/analyze/file/sync")
async def analyze_audio_file_sync(
    file: UploadFile = File(...),
    language: str = Form(None),
    analysis_type: str = Form("general"),
    instructions: str = Form(None),
):
    """Synchronous analysis — blocks until complete. Use for short audio (<5 min)."""
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    temp_path = settings.TEMP_AUDIO_DIR / f"{uuid.uuid4()}{suffix}"
    content = await file.read()
    temp_path.write_bytes(content)

    try:
        from .services.soniox import SonioxASR
        from .services.llm import LLMAnalyzer
        import asyncio

        soniox = SonioxASR(api_key=settings.SONIOX_API_KEY, max_duration_sec=settings.SONIOX_MAX_DURATION_SEC)
        llm_analyzer = LLMAnalyzer(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            model=settings.LLM_MODEL,
            model_fast=settings.LLM_MODEL_FAST,
        )

        transcript, tokens, duration = soniox.transcribe_file(temp_path, language=language)
        normalized = soniox.normalize_transcript(transcript)

        result = await llm_analyzer.analyze(
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

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/analyze/url/sync")
async def analyze_audio_url_sync(req: AnalyzeUrlRequest):
    """Synchronous analysis from URL — blocks until complete."""
    try:
        from .services.soniox import SonioxASR
        from .services.llm import LLMAnalyzer

        soniox = SonioxASR(api_key=settings.SONIOX_API_KEY, max_duration_sec=settings.SONIOX_MAX_DURATION_SEC)
        llm_analyzer = LLMAnalyzer(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
            model=settings.LLM_MODEL,
            model_fast=settings.LLM_MODEL_FAST,
        )

        transcript, tokens, duration = soniox.transcribe_url(req.audio_url, language=req.language)
        normalized = soniox.normalize_transcript(transcript)

        result = await llm_analyzer.analyze(
            normalized,
            analysis_type=req.analysis_type,
            instructions=req.instructions,
            duration_seconds=duration,
            language=req.language,
        )

        result.transcript = transcript
        result.normalized_transcript = normalized
        result.duration_seconds = duration
        result.metadata = req.metadata

        return result.model_dump()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

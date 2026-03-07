"""Старые пути API без префикса `/api/v1` — для совместимости с существующими клиентами."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import get_analysis_service
from app.application.analysis_service import AnalysisService
from app.core.config import settings
from app.domain.models import AnalyzeUrlRequest, TaskResponse

router = APIRouter(tags=["legacy"])


@router.get("/health")
def health_legacy():
    return {"status": "ok", "service": "audio-jois"}


@router.post("/analyze/file", response_model=TaskResponse, status_code=202)
async def analyze_audio_file(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    analysis_type: str = Form("general"),
    instructions: str | None = Form(None),
    webhook_url: str | None = Form(None),
    service: AnalysisService = Depends(get_analysis_service),
):
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    temp_path = settings.TEMP_AUDIO_DIR / f"{uuid.uuid4()}{suffix}"
    content = await file.read()
    temp_path.write_bytes(content)

    job = service.enqueue_file_job(
        file_path=temp_path,
        language=language,
        analysis_type=analysis_type,
        instructions=instructions,
        webhook_url=webhook_url,
    )
    return TaskResponse(task_id=job.task_id)


@router.post("/analyze/url", response_model=TaskResponse, status_code=202)
def analyze_audio_url(
    req: AnalyzeUrlRequest,
    service: AnalysisService = Depends(get_analysis_service),
):
    job = service.enqueue_url_job(req)
    return TaskResponse(task_id=job.task_id)


@router.get("/results/{task_id}")
def get_result_legacy(
    task_id: str,
    service: AnalysisService = Depends(get_analysis_service),
):
    st = service.get_job_status(task_id)
    if st.status == "pending":
        return {"task_id": task_id, "status": "pending"}
    if st.status == "processing":
        return {"task_id": task_id, "status": "processing"}
    if st.status == "completed":
        return {"task_id": task_id, "status": "completed", "result": st.result}
    if st.status == "failed":
        return {"task_id": task_id, "status": "failed", "error": st.error}
    return {"task_id": task_id, "status": st.status}


@router.post("/analyze/file/sync")
async def analyze_audio_file_sync(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    analysis_type: str = Form("general"),
    instructions: str | None = Form(None),
    service: AnalysisService = Depends(get_analysis_service),
):
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    temp_path = settings.TEMP_AUDIO_DIR / f"{uuid.uuid4()}{suffix}"
    content = await file.read()
    temp_path.write_bytes(content)

    try:
        return await service.run_file_sync(
            temp_path,
            language=language,
            analysis_type=analysis_type,
            instructions=instructions,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        temp_path.unlink(missing_ok=True)


@router.post("/analyze/url/sync")
async def analyze_audio_url_sync(
    req: AnalyzeUrlRequest,
    service: AnalysisService = Depends(get_analysis_service),
):
    try:
        return await service.run_url_sync(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

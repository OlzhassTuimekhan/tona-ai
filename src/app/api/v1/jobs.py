import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import get_analysis_service, require_operator
from app.application.analysis_service import AnalysisService
from app.application.profiles import list_analysis_profiles
from app.application.role_policy import assert_analysis_type_allowed
from app.core.config import settings
from app.infrastructure.storage.object_storage import upload_job_audio_and_return_ref
from app.domain.models import AnalyzeUrlRequest, JobCreatedResponse, JobStatusResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/profiles")
def analysis_profiles():
    return {"profiles": list_analysis_profiles()}


@router.post("/file", response_model=JobCreatedResponse, status_code=202)
async def create_job_from_file(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    analysis_type: str = Form("general"),
    instructions: str | None = Form(None),
    webhook_url: str | None = Form(None),
    user: dict[str, Any] = Depends(require_operator),
    service: AnalysisService = Depends(get_analysis_service),
):
    assert_analysis_type_allowed(user, analysis_type)
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    temp_path = settings.TEMP_AUDIO_DIR / f"{uuid.uuid4()}{suffix}"
    content = await file.read()
    temp_path.write_bytes(content)

    audio_ref = upload_job_audio_and_return_ref(settings, temp_path)

    return service.enqueue_file_job(
        file_path=audio_ref,
        language=language,
        analysis_type=analysis_type,
        instructions=instructions,
        webhook_url=webhook_url,
    )


@router.post("/url", response_model=JobCreatedResponse, status_code=202)
def create_job_from_url(
    req: AnalyzeUrlRequest,
    user: dict[str, Any] = Depends(require_operator),
    service: AnalysisService = Depends(get_analysis_service),
):
    assert_analysis_type_allowed(user, req.analysis_type)
    return service.enqueue_url_job(req)


@router.get("/{task_id}", response_model=JobStatusResponse)
def get_job(
    task_id: str,
    _user: dict[str, Any] = Depends(require_operator),
    service: AnalysisService = Depends(get_analysis_service),
):
    return service.get_job_status(task_id)


@router.post("/file/sync")
async def run_file_sync(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    analysis_type: str = Form("general"),
    instructions: str | None = Form(None),
    user: dict[str, Any] = Depends(require_operator),
    service: AnalysisService = Depends(get_analysis_service),
):
    assert_analysis_type_allowed(user, analysis_type)
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


@router.post("/url/sync")
async def run_url_sync(
    req: AnalyzeUrlRequest,
    user: dict[str, Any] = Depends(require_operator),
    service: AnalysisService = Depends(get_analysis_service),
):
    assert_analysis_type_allowed(user, req.analysis_type)
    try:
        return await service.run_url_sync(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

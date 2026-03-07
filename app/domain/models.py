from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class AnalyzeUrlRequest(BaseModel):
    audio_url: str
    language: str | None = None
    analysis_type: str = "general"
    instructions: str | None = None
    webhook_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Speaker(BaseModel):
    id: str
    label: str
    role: str | None = None
    speaking_time_seconds: float | None = None


class Commitment(BaseModel):
    description: str
    responsible: str | None = None
    deadline: str | None = None
    location: str | None = None
    category: str | None = None
    priority: str = "medium"
    quote: str = ""
    timestamp_start: float | None = None
    timestamp_end: float | None = None


class Decision(BaseModel):
    description: str
    made_by: str | None = None
    quote: str = ""
    timestamp_start: float | None = None


class ActionItem(BaseModel):
    description: str
    responsible: str | None = None
    deadline: str | None = None
    priority: str = "medium"


class Violation(BaseModel):
    description: str
    severity: str = "medium"
    speaker: str | None = None
    quote: str = ""
    timestamp_start: float | None = None
    timestamp_end: float | None = None
    category: str | None = None


class AnalysisResult(BaseModel):
    transcript: str
    normalized_transcript: str = ""
    summary: str = ""
    language_detected: str | None = None
    duration_seconds: float | None = None

    speakers: list[Speaker] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)
    commitments: list[Commitment] = Field(default_factory=list)
    decisions: list[Decision] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    violations: list[Violation] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)

    sentiment: str = "neutral"
    topics: list[str] = Field(default_factory=list)
    risk_assessment: str | None = None

    raw_llm_response: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskResponse(BaseModel):
    task_id: str
    status: str = "processing"


class TaskResult(BaseModel):
    task_id: str
    status: str
    result: AnalysisResult | None = None
    error: str | None = None
    created_at: datetime | None = None


class JobCreatedResponse(BaseModel):
    """Ответ после постановки задачи в очередь."""

    task_id: str
    status: str = "queued"


class JobStatusResponse(BaseModel):
    """Унифицированный статус асинхронной задачи (для API и фронта)."""

    task_id: str
    status: str
    result: dict[str, Any] | None = None
    error: str | None = None


class RegistryImportBody(BaseModel):
    task_id: str
    analysis_type: str | None = None
    title_override: str | None = None


class RegistryImportResponse(BaseModel):
    session_id: str
    duplicate: bool = False


class RegistrySessionSummary(BaseModel):
    id: str
    task_id: str
    created_at: str
    title: str
    analysis_type: str
    commitments_total: int
    commitments_verified_quotes: int
    published: bool = False


class RegistrySessionListResponse(BaseModel):
    sessions: list[RegistrySessionSummary]


class PublishSessionBody(BaseModel):
    """Опубликовать карточку для народного контроля (без авторизации для чтения)."""

    published: bool
    public_org: str | None = Field(
        None,
        max_length=200,
        description="Например: Акимат г. Талдыкорган",
    )


class PublicObservationBody(BaseModel):
    """Наблюдение от горожанина (антибот — проверка голосом до вызова сервиса)."""

    observation_type: Literal["was_there", "work_done", "dispute"]
    commitment_index: int | None = Field(
        None,
        ge=0,
        description="Индекс строки поручения (0…); пусто = ко всей сессии",
    )
    note: str | None = Field(None, max_length=2000)
    photo_url: str | None = Field(None, max_length=2048)
    website: str = Field(default="", description="Honeypot: не заполнять")

    @field_validator("website")
    @classmethod
    def honeypot_empty(cls, v: str) -> str:
        if v:
            raise ValueError("invalid_request")
        return v


class RatingInfo(BaseModel):
    level: Literal["green", "yellow", "red"]
    score: int = Field(ge=0, le=100)
    total: int = 0
    positive: int = 0
    negative: int = 0
    neutral: int = 0


class PublicSessionSummary(BaseModel):
    id: str
    created_at: str
    title: str
    public_org: str | None
    city: str | None = None
    region: str | None = None
    commitments_total: int
    observations_total: int
    observations_with_photo: int = 0
    rating: RatingInfo = Field(default_factory=lambda: RatingInfo(level="yellow", score=50))


class PublicSessionListResponse(BaseModel):
    sessions: list[PublicSessionSummary]

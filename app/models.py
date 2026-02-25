from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


# ── Request models ──────────────────────────────────────────────

class AnalyzeUrlRequest(BaseModel):
    audio_url: str
    language: str | None = None
    analysis_type: str = "general"
    instructions: str | None = None
    webhook_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── Analysis output models ──────────────────────────────────────

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


# ── Task response models ────────────────────────────────────────

class TaskResponse(BaseModel):
    task_id: str
    status: str = "processing"


class TaskResult(BaseModel):
    task_id: str
    status: str
    result: AnalysisResult | None = None
    error: str | None = None
    created_at: datetime | None = None

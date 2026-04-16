from app.core.config import Settings
from app.infrastructure.asr.soniox import SonioxASR
from app.infrastructure.llm.llm_client import LLMAnalyzer


def build_soniox(settings: Settings) -> SonioxASR:
    return SonioxASR(
        api_key=settings.SONIOX_API_KEY,
        max_duration_sec=settings.SONIOX_MAX_DURATION_SEC,
    )


def build_llm(settings: Settings) -> LLMAnalyzer:
    return LLMAnalyzer(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
        model=settings.LLM_MODEL,
        model_fast=settings.LLM_MODEL_FAST,
    )

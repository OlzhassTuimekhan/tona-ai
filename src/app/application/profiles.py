from app.infrastructure.llm.llm_client import ANALYSIS_PROMPTS

_LABELS: dict[str, str] = {
    "general": "Общий анализ",
    "meeting": "Совещание / госорганы",
    "court": "Судебное заседание",
    "police": "Полицейский протокол / бейдж",
    "call_center": "Call-центр",
}


def list_analysis_profiles() -> list[dict[str, str]]:
    return [{"id": pid, "label": _LABELS.get(pid, pid)} for pid in ANALYSIS_PROMPTS]

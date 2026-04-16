from fastapi import HTTPException, status

from app.infrastructure.llm.llm_client import ANALYSIS_PROMPTS

KNOWN_ANALYSIS_IDS: frozenset[str] = frozenset(ANALYSIS_PROMPTS.keys())

OPERATOR_ROLES: frozenset[str] = frozenset({
    "akim",
    "general",
    "meeting",
    "court",
    "police",
    "call_center",
})

ROLE_LABELS_RU: dict[str, str] = {
    "admin": "Администратор",
    "akim": "Аким / госорганы (все профили)",
    "citizen": "Гражданин",
    "general": "Оператор: общий анализ",
    "meeting": "Оператор: совещания / госорганы",
    "court": "Оператор: суд",
    "police": "Оператор: полиция / протокол",
    "call_center": "Оператор: call-центр",
}


def is_operator_role(role: str | None) -> bool:
    if role == "admin":
        return True
    return role in OPERATOR_ROLES


def allowed_analysis_types(role: str | None) -> list[str]:
    r = role or ""
    if r == "admin" or r == "akim":
        return sorted(KNOWN_ANALYSIS_IDS)
    if r in KNOWN_ANALYSIS_IDS:
        return [r]
    return []


def assert_analysis_type_allowed(user: dict, analysis_type: str | None) -> None:
    at = (analysis_type or "general").strip()
    if at not in KNOWN_ANALYSIS_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unknown_analysis_type",
        )
    allowed = set(allowed_analysis_types(user.get("role")))
    if at not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="analysis_type_not_allowed_for_role",
        )


def enrich_user_response(user: dict) -> dict:
    out = {**user}
    out["allowed_analysis_types"] = allowed_analysis_types(user.get("role"))
    out["role_label_ru"] = ROLE_LABELS_RU.get(user.get("role", ""), user.get("role", ""))
    return out

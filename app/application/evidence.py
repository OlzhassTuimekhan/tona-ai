"""Постобработка для explainability: проверка цитат против транскрипта (без второго LLM)."""

import copy
import re
from typing import Any


def _squash(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[«»\"'`]", " ", s)
    s = re.sub(r"[\s.,:;!?()[\]—–\-]+", " ", s)
    return s.strip()


def _alnum_only(s: str) -> str:
    return re.sub(r"[\W_]+", "", s.lower())


def quote_matches_transcript(quote: str, transcript: str) -> bool:
    if not quote.strip() or not transcript.strip():
        return False
    qn = _squash(quote)
    tn = _squash(transcript)
    if len(qn) < 4:
        return qn in tn
    if qn in tn:
        return True
    qa = _alnum_only(quote)
    ta = _alnum_only(transcript)
    if len(qa) >= 12 and qa in ta:
        return True
    return False


def enrich_extracted_items(analysis: dict[str, Any]) -> dict[str, Any]:
    """Добавляет evidence_verified / evidence_note к элементам с полем quote."""
    out = copy.deepcopy(analysis)
    text = (out.get("normalized_transcript") or out.get("transcript") or "") or ""

    lists = ("commitments", "decisions", "violations", "action_items")
    verified_counts: dict[str, tuple[int, int]] = {}

    for key in lists:
        items = out.get(key)
        if not isinstance(items, list):
            continue
        new_list: list[Any] = []
        ok = 0
        with_quote = 0
        for item in items:
            if not isinstance(item, dict):
                new_list.append(item)
                continue
            q = (item.get("quote") or "").strip()
            if not q:
                merged = {
                    **item,
                    "evidence_verified": None,
                    "evidence_note": "нет_цитаты",
                }
                new_list.append(merged)
                continue
            with_quote += 1
            match = quote_matches_transcript(q, text)
            if match:
                ok += 1
            new_list.append(
                {
                    **item,
                    "evidence_verified": match,
                    "evidence_note": None
                    if match
                    else "цитата_не_найдена_в_транскрипте_дословно",
                }
            )
        out[key] = new_list
        verified_counts[key] = (with_quote, ok)

    total_q = sum(a for a, _ in verified_counts.values())
    total_ok = sum(b for _, b in verified_counts.values())
    prev = out.get("postprocess") if isinstance(out.get("postprocess"), dict) else {}
    out["postprocess"] = {
        **prev,
        "version": 1,
        "quote_check": "transcript_substring_relaxed",
        "quotes_with_citation": total_q,
        "quotes_verified_in_transcript": total_ok,
        "by_section": {k: {"with_quote": a, "verified": b} for k, (a, b) in verified_counts.items()},
    }
    return out

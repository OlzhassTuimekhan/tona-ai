"""Таймкоды поручений: ASR = truth по времени, LLM = смысл; привязка через цитату или snap к сегментам."""

from __future__ import annotations

from typing import Any

from app.application.evidence import _alnum_only, _squash


def _segment_dicts(transcript_segments: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in transcript_segments:
        if hasattr(s, "model_dump"):
            out.append(s.model_dump())
        elif isinstance(s, dict):
            out.append(s)
    return out


def _commitment_to_dict(c: Any) -> dict[str, Any]:
    if hasattr(c, "model_dump"):
        return dict(c.model_dump())
    if isinstance(c, dict):
        return dict(c)
    return {}


def _snap_llm_to_segment(llm_ts: float, segments: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not segments:
        return None
    return min(segments, key=lambda s: abs(float(s["start_sec"]) - llm_ts))


def _find_quote_time_range(
    quote: str,
    segments: list[dict[str, Any]],
) -> tuple[float, float] | None:
    """Ищет цитату в текстах сегментов ASR (включая окна из нескольких сегментов)."""
    q = (quote or "").strip()
    if not q:
        return None
    qn = _squash(q)
    if len(qn) < 4:
        return None
    qa = _alnum_only(q)
    use_alnum = len(qa) >= 12

    for seg in segments:
        raw = seg.get("text") or ""
        sn = _squash(raw)
        if qn in sn:
            return float(seg["start_sec"]), float(seg["end_sec"])
        if use_alnum and qa in _alnum_only(raw):
            return float(seg["start_sec"]), float(seg["end_sec"])

    n = len(segments)
    for size in range(2, min(8, n + 1)):
        for i in range(0, n - size + 1):
            chunk = "".join(segments[i + k].get("text") or "" for k in range(size))
            cn = _squash(chunk)
            if qn in cn:
                return float(segments[i]["start_sec"]), float(segments[i + size - 1]["end_sec"])
            if use_alnum and qa in _alnum_only(chunk):
                return float(segments[i]["start_sec"]), float(segments[i + size - 1]["end_sec"])
    return None


def align_commitments_to_asr(
    commitments: list[Any],
    transcript_segments: list[Any],
) -> list[dict[str, Any]]:
    """
    Проставляет timestamp_start / timestamp_end из сегментов Soniox:
    1) по совпадению цитаты с текстом сегментов;
    2) иначе snap LLM timestamp к ближайшему segment.start;
    3) иначе оставляет LLM-таймкоды с пометкой llm_only (слабее для seek).
    """
    segs = _segment_dicts(transcript_segments)
    out: list[dict[str, Any]] = []

    for c in commitments:
        d = _commitment_to_dict(c)
        quote = (d.get("quote") or "").strip()

        if segs:
            span = _find_quote_time_range(quote, segs) if quote else None
            if span:
                t0, t1 = span
                d["timestamp_start"] = round(t0, 3)
                d["timestamp_end"] = round(t1, 3)
                d["time_alignment"] = "asr_quote_span"
                out.append(d)
                continue

            llm_raw = d.get("timestamp_start")
            if llm_raw is not None:
                try:
                    llm_ts = float(llm_raw)
                except (TypeError, ValueError):
                    d["time_alignment"] = "none"
                    out.append(d)
                    continue
                hit = _snap_llm_to_segment(llm_ts, segs)
                if hit:
                    d["timestamp_start"] = round(float(hit["start_sec"]), 3)
                    d["timestamp_end"] = round(float(hit["end_sec"]), 3)
                    d["time_alignment"] = "asr_snap"
                    out.append(d)
                    continue

        # Нет сегментов или snap не применился — не подменяем смысл LLM, но помечаем слабый слой
        if d.get("timestamp_start") is not None:
            d["time_alignment"] = "llm_only"
        else:
            d["time_alignment"] = "none"
        out.append(d)

    return out

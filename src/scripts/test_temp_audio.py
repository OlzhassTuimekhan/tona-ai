"""Inspect a file in temp_audio (duration, size); optional Soniox segments."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SRC = REPO_ROOT / "src"


def _duration_sec(path: Path) -> float | None:
    try:
        from mutagen.mp4 import MP4  # type: ignore

        if path.suffix.lower() in (".m4a", ".mp4"):
            return float(MP4(path).info.length)
    except Exception:
        pass
    try:
        from mutagen import File as MutagenFile  # type: ignore

        f = MutagenFile(path)
        if f is not None and getattr(f.info, "length", None):
            return float(f.info.length)
    except Exception:
        pass
    return None


def _pick_audio() -> Path | None:
    d = REPO_ROOT / "temp_audio"
    if not d.is_dir():
        print(f"No directory {d}", file=sys.stderr)
        return None
    for ext in (".m4a", ".mp4", ".wav", ".mp3", ".webm", ".ogg"):
        for p in sorted(d.glob(f"*{ext}")):
            return p
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect temp_audio or run Soniox on a file")
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Audio path (default: first file in temp_audio)",
    )
    parser.add_argument(
        "--soniox",
        action="store_true",
        help="Call Soniox (needs SONIOX_API_KEY in .env) and print first segments",
    )
    args = parser.parse_args()

    path = args.file.resolve() if args.file else _pick_audio()
    if path is None or not path.is_file():
        print("No audio file. Add .m4a/.mp3 under temp_audio/ or pass --file", file=sys.stderr)
        return 1

    size = path.stat().st_size
    dur = _duration_sec(path)
    print(f"file: {path}")
    print(f"size_bytes: {size}")
    if dur is not None:
        print(f"duration_sec (mutagen): {dur:.3f}")
    else:
        print("duration_sec: unknown (install mutagen or ffprobe in PATH)")

    if not args.soniox:
        print("\nTip: run with --soniox to fetch Soniox segments (needs SONIOX_API_KEY).")
        return 0

    sys.path.insert(0, str(SRC))
    from app.core.config import settings  # noqa: E402
    from app.infrastructure.asr.soniox import SonioxASR  # noqa: E402

    soniox = SonioxASR(settings.SONIOX_API_KEY, max_duration_sec=settings.SONIOX_MAX_DURATION_SEC)
    print("\nSoniox: transcribing…")
    _transcript, tokens, asr_dur = soniox.transcribe_file(path, language=None)
    segs = SonioxASR.tokens_to_diarized_segments(tokens, duration_hint_sec=asr_dur)
    words = SonioxASR.tokens_to_word_segments(tokens, duration_hint_sec=asr_dur)
    print(
        f"tokens: {len(tokens)}, speaker_segments: {len(segs)}, word_segments: {len(words)}, duration_from_asr: {asr_dur}",
    )
    for i, s in enumerate(segs[:8]):
        print(f"  [{i}] start_sec={s['start_sec']!r} end_sec={s['end_sec']!r} text={s.get('text', '')[:60]!r}…")
    if len(segs) > 8:
        print(f"  … total {len(segs)} segments")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

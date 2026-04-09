"""
Проверка файла в temp_audio: длительность, размер, опционально Soniox → сегменты с start_sec.

Запуск из корня репозитория:
  python scripts/test_temp_audio.py
  python scripts/test_temp_audio.py --soniox

Для длительности m4a/mp3 без ffmpeg в PATH нужен пакет mutagen:
  pip install mutagen
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


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
    d = ROOT / "temp_audio"
    if not d.is_dir():
        print(f"Нет каталога {d}", file=sys.stderr)
        return None
    for ext in (".m4a", ".mp4", ".wav", ".mp3", ".webm", ".ogg"):
        for p in sorted(d.glob(f"*{ext}")):
            return p
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Проверка temp_audio и опционально ASR-сегментов")
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Путь к аудио (по умолчанию — первый файл в temp_audio)",
    )
    parser.add_argument(
        "--soniox",
        action="store_true",
        help="Вызвать Soniox (нужен SONIOX_API_KEY в .env) и вывести первые сегменты",
    )
    args = parser.parse_args()

    path = args.file.resolve() if args.file else _pick_audio()
    if path is None or not path.is_file():
        print("Не найден аудиофайл. Положите .m4a/.mp3 в temp_audio/ или укажите --file", file=sys.stderr)
        return 1

    size = path.stat().st_size
    dur = _duration_sec(path)
    print(f"file: {path}")
    print(f"size_bytes: {size}")
    if dur is not None:
        print(f"duration_sec (mutagen): {dur:.3f}")
    else:
        print("duration_sec: не удалось (установите: pip install mutagen, или ffprobe в PATH)")

    if not args.soniox:
        print("\nTip: run with --soniox to fetch Soniox segments (needs SONIOX_API_KEY).")
        return 0

    sys.path.insert(0, str(ROOT))
    from app.core.config import settings  # noqa: E402
    from app.infrastructure.asr.soniox import SonioxASR  # noqa: E402

    soniox = SonioxASR(settings.SONIOX_API_KEY, max_duration_sec=settings.SONIOX_MAX_DURATION_SEC)
    print("\nSoniox: транскрибация (сеть)…")
    transcript, tokens, asr_dur = soniox.transcribe_file(path, language=None)
    segs = SonioxASR.tokens_to_diarized_segments(tokens, duration_hint_sec=asr_dur)
    words = SonioxASR.tokens_to_word_segments(tokens, duration_hint_sec=asr_dur)
    print(
        f"tokens: {len(tokens)}, speaker_segments: {len(segs)}, word_segments: {len(words)}, duration_from_asr: {asr_dur}",
    )
    for i, s in enumerate(segs[:8]):
        print(f"  [{i}] start_sec={s['start_sec']!r} end_sec={s['end_sec']!r} text={s.get('text', '')[:60]!r}…")
    if len(segs) > 8:
        print(f"  … всего {len(segs)} сегментов")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

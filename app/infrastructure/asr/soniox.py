import re
import time
import json
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Optional

import requests
from pydub import AudioSegment

logger = logging.getLogger(__name__)


class SonioxASR:

    SONIOX_BASE_URL = "https://api.soniox.com"
    DEFAULT_LANGUAGE_HINTS = ["kk", "ru", "en"]

    def __init__(self, api_key: str, max_duration_sec: int = 14400):
        self.api_key = api_key
        self.max_duration_sec = max_duration_sec

    def _headers(self, content_type: str | None = None) -> dict:
        h = {"Authorization": f"Bearer {self.api_key}"}
        if content_type:
            h["Content-Type"] = content_type
        return h

    # ── File operations ─────────────────────────────────────────

    def _upload_file(self, audio_path: Path) -> str:
        if not audio_path.exists():
            raise FileNotFoundError(f"File not found: {audio_path}")

        with open(audio_path, "rb") as f:
            resp = requests.post(
                f"{self.SONIOX_BASE_URL}/v1/files",
                headers=self._headers(),
                files={"file": (audio_path.name, f)},
                timeout=120,
            )

        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Soniox upload failed: {resp.status_code} {resp.text[:500]}")

        file_id = resp.json().get("id") or resp.json().get("file_id")
        if not file_id:
            raise RuntimeError(f"Soniox returned empty file_id: {resp.json()}")
        return file_id

    def _delete_file(self, file_id: str) -> None:
        try:
            requests.delete(
                f"{self.SONIOX_BASE_URL}/v1/files/{file_id}",
                headers=self._headers(),
                timeout=30,
            )
        except Exception as e:
            logger.warning(f"Failed to delete Soniox file {file_id}: {e}")

    # ── Transcription lifecycle ─────────────────────────────────

    def _create_transcription(
        self,
        *,
        file_id: str | None = None,
        audio_url: str | None = None,
        language_hints: list[str] | None = None,
    ) -> str:
        payload = {
            "model": "stt-async-v3",
            "language_hints": language_hints or self.DEFAULT_LANGUAGE_HINTS,
            "enable_speaker_diarization": True,
            "enable_language_identification": True,
        }
        if file_id:
            payload["file_id"] = file_id
        elif audio_url:
            payload["audio_url"] = audio_url
        else:
            raise ValueError("Either file_id or audio_url is required")

        resp = requests.post(
            f"{self.SONIOX_BASE_URL}/v1/transcriptions",
            headers=self._headers("application/json"),
            json=payload,
            timeout=60,
        )

        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Soniox transcription create failed: {resp.status_code} {resp.text[:500]}")

        tr_id = resp.json().get("id") or resp.json().get("transcription_id")
        if not tr_id:
            raise RuntimeError(f"Soniox returned empty transcription_id: {resp.json()}")
        return tr_id

    def _poll_status(self, transcription_id: str, interval: int = 10, timeout: int = 21600) -> tuple[str, str | None]:
        url = f"{self.SONIOX_BASE_URL}/v1/transcriptions/{transcription_id}"
        start = time.time()
        last_log = 0

        while True:
            resp = requests.get(url, headers=self._headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            status = (data.get("status") or "").lower()
            error = data.get("error") or data.get("error_message") or data.get("message")

            if status in ("completed", "error"):
                return status, error

            if time.time() - start > timeout:
                raise TimeoutError("Soniox transcription polling timed out")

            elapsed = int(time.time() - start)
            if elapsed - last_log >= 60:
                logger.info(f"Soniox polling: {status}, {elapsed // 60}m elapsed")
                last_log = elapsed

            time.sleep(interval)

    def _fetch_tokens(self, transcription_id: str) -> list[dict]:
        url = f"{self.SONIOX_BASE_URL}/v1/transcriptions/{transcription_id}/transcript"
        resp = requests.get(url, headers=self._headers(), timeout=60)
        resp.raise_for_status()

        if resp.headers.get("Content-Type", "").startswith("text/plain"):
            return [{"text": resp.text}]
        return resp.json().get("tokens", [])

    # ── Token → text assembly ───────────────────────────────────

    def _tokens_to_transcript(self, tokens: list[dict]) -> str:
        parts: list[str] = []
        current_lang = None

        for t in tokens:
            txt = str(t.get("text", ""))
            lang = t.get("language")

            if lang and lang != current_lang:
                current_lang = str(lang)
                parts.append(f" [{current_lang}] ")

            start_ms = t.get("start_ms") or t.get("start_time_ms")
            end_ms = t.get("end_ms") or t.get("end_time_ms")

            if start_ms is not None:
                s = start_ms / 1000.0
                if end_ms is not None:
                    e = end_ms / 1000.0
                    parts.append(f"[{s:.2f}s-{e:.2f}s]{txt}")
                else:
                    parts.append(f"[{s:.2f}s]{txt}")
            else:
                parts.append(txt)

        return "".join(parts).strip()

    # ── Audio conversion ────────────────────────────────────────

    def _convert_to_mono_wav(self, audio_path: Path) -> tuple[Path, bool]:
        try:
            audio = AudioSegment.from_file(str(audio_path))
            if audio.channels == 1 and audio.frame_rate == 16000 and audio_path.suffix.lower() == ".wav":
                return audio_path, False

            audio = audio.set_channels(1).set_frame_rate(16000)
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp_path = Path(tmp.name)
            tmp.close()
            audio.export(str(tmp_path), format="wav", parameters=["-ac", "1", "-ar", "16000"])
            return tmp_path, True
        except Exception:
            if audio_path.suffix.lower() == ".wav":
                return audio_path, False
            raise

    # ── Public: transcribe from file ────────────────────────────

    def transcribe_file(self, audio_path: Path, *, language: str | None = None) -> tuple[str, list[dict], float | None]:
        hints = self._resolve_hints(language)
        audio = AudioSegment.from_file(str(audio_path))
        duration_sec = len(audio) / 1000.0

        if duration_sec <= self.max_duration_sec:
            transcript, tokens = self._transcribe_single_file(audio_path, hints)
        else:
            logger.info(f"Audio {duration_sec:.0f}s exceeds limit, chunking...")
            transcript, tokens = self._transcribe_chunked_file(audio_path, audio, hints)

        duration = self._duration_from_tokens(tokens) or duration_sec
        return transcript, tokens, duration

    def _transcribe_single_file(self, audio_path: Path, hints: list[str]) -> tuple[str, list[dict]]:
        converted_path, is_temp = self._convert_to_mono_wav(audio_path)
        file_id = None
        try:
            file_id = self._upload_file(converted_path)
            tr_id = self._create_transcription(file_id=file_id, language_hints=hints)
            status, error = self._poll_status(tr_id)
            if status != "completed":
                raise RuntimeError(f"Soniox transcription failed: {status}, {error}")

            tokens = self._fetch_tokens(tr_id)
            return self._tokens_to_transcript(tokens), tokens
        finally:
            if file_id:
                self._delete_file(file_id)
            if is_temp and converted_path.exists():
                converted_path.unlink(missing_ok=True)

    def _transcribe_chunked_file(self, audio_path: Path, audio: AudioSegment, hints: list[str]) -> tuple[str, list[dict]]:
        chunk_ms = self.max_duration_sec * 1000
        all_parts: list[str] = []
        all_tokens: list[dict] = []
        start = 0
        idx = 0

        while start < len(audio):
            end = min(start + chunk_ms, len(audio))
            chunk = audio[start:end]

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                chunk_path = Path(tmp.name)

            try:
                chunk.export(str(chunk_path), format="wav")
                text, tokens = self._transcribe_single_file(chunk_path, hints)
                shifted = self._shift_tokens(tokens, start)
                all_parts.append(text)
                all_tokens.extend(shifted)
                idx += 1
            finally:
                chunk_path.unlink(missing_ok=True)

            start = end

        return " ".join(all_parts), all_tokens

    # ── Public: transcribe from URL ─────────────────────────────

    def transcribe_url(self, audio_url: str, *, language: str | None = None) -> tuple[str, list[dict], float | None]:
        hints = self._resolve_hints(language)

        duration_sec = self._probe_duration(audio_url)

        if duration_sec and duration_sec > self.max_duration_sec:
            logger.info(f"URL audio {duration_sec:.0f}s exceeds limit, chunking via ffmpeg...")
            transcript, tokens = self._transcribe_chunked_url(audio_url, hints, duration_sec)
            duration = self._duration_from_tokens(tokens) or duration_sec
            return transcript, tokens, duration

        try:
            tr_id = self._create_transcription(audio_url=audio_url, language_hints=hints)
            status, error = self._poll_status(tr_id)

            if status == "completed":
                tokens = self._fetch_tokens(tr_id)
                transcript = self._tokens_to_transcript(tokens)
                duration = self._duration_from_tokens(tokens) or duration_sec
                return transcript, tokens, duration

            if error and "Maximum audio duration" in error:
                logger.info("Soniox duration limit hit, falling back to ffmpeg chunking")
            else:
                raise RuntimeError(f"Soniox URL transcription failed: {status}, {error}")
        except RuntimeError as exc:
            if "Maximum audio duration" not in str(exc):
                raise

        transcript, tokens = self._transcribe_chunked_url(audio_url, hints, duration_sec or 0)
        duration = self._duration_from_tokens(tokens) or duration_sec
        return transcript, tokens, duration

    def _transcribe_chunked_url(self, audio_url: str, hints: list[str], total_duration: float) -> tuple[str, list[dict]]:
        if not total_duration:
            total_duration = self._probe_duration(audio_url) or 0
            if not total_duration:
                raise RuntimeError("Cannot determine audio duration for chunking")

        num_chunks = max(1, int(total_duration / self.max_duration_sec) + (1 if total_duration % self.max_duration_sec > 0 else 0))
        all_parts: list[str] = []
        all_tokens: list[dict] = []

        for i in range(num_chunks):
            start_sec = i * self.max_duration_sec
            offset_ms = int(start_sec * 1000)

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                chunk_path = Path(tmp.name)

            file_id = None
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-ss", str(start_sec),
                        "-i", audio_url,
                        "-t", str(self.max_duration_sec),
                        "-ar", "16000", "-ac", "1",
                        "-f", "wav",
                        str(chunk_path),
                    ],
                    capture_output=True,
                    timeout=600,
                    check=True,
                )

                file_id = self._upload_file(chunk_path)
                tr_id = self._create_transcription(file_id=file_id, language_hints=hints)
                status, error = self._poll_status(tr_id)
                if status != "completed":
                    raise RuntimeError(f"Chunk {i+1} failed: {status}, {error}")

                tokens = self._fetch_tokens(tr_id)
                text = self._tokens_to_transcript(tokens)
                shifted = self._shift_tokens(tokens, offset_ms)
                all_parts.append(text)
                all_tokens.extend(shifted)
            finally:
                if file_id:
                    self._delete_file(file_id)
                chunk_path.unlink(missing_ok=True)

        return " ".join(all_parts), all_tokens

    # ── Helpers ──────────────────────────────────────────────────

    def _resolve_hints(self, language: str | None) -> list[str]:
        if language and language.lower() not in ("auto", "none", ""):
            return [language]
        return self.DEFAULT_LANGUAGE_HINTS

    def _probe_duration(self, audio_url: str) -> float | None:
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", audio_url],
                capture_output=True, text=True, timeout=60,
            )
            if result.returncode == 0:
                return float(json.loads(result.stdout).get("format", {}).get("duration", 0))
        except Exception:
            pass
        return None

    @staticmethod
    def _shift_tokens(tokens: list[dict], offset_ms: int) -> list[dict]:
        shifted = []
        for t in tokens:
            t = dict(t)
            for key in ("start_ms", "start_time_ms"):
                if t.get(key) is not None:
                    t[key] += offset_ms
            for key in ("end_ms", "end_time_ms"):
                if t.get(key) is not None:
                    t[key] += offset_ms
            shifted.append(t)
        return shifted

    @staticmethod
    def _duration_from_tokens(tokens: list[dict]) -> float | None:
        if not tokens:
            return None
        max_end = max((t.get("end_ms") or t.get("end_time_ms") or 0) for t in tokens)
        return max_end / 1000.0 if max_end > 0 else None

    # ── Transcript normalization ────────────────────────────────
    # Soniox produces per-character timestamps: [6.60s-6.60s]З[6.60s-7.00s]дра...
    # This compresses to word-level: [6.60s] Здравствуйте [7.00s] добрый
    # ~5-8x token savings for LLM input.

    @staticmethod
    def normalize_transcript(raw_transcript: str) -> str:
        token_pattern = re.compile(r'\[(\d+(?:\.\d+)?)s-(\d+(?:\.\d+)?)s\]([^\[]*)')
        tokens = token_pattern.findall(raw_transcript)

        if not tokens:
            return raw_transcript

        words: list[tuple[float, str]] = []
        current_word = ""
        current_start = 0.0

        for t_start_str, _, text in tokens:
            t_start = float(t_start_str)
            if not text:
                continue

            if text.startswith((" ", "\n")):
                if current_word.strip():
                    words.append((current_start, current_word.strip()))
                current_word = text.lstrip(" \n")
                current_start = t_start
            else:
                if not current_word:
                    current_start = t_start
                current_word += text

        if current_word.strip():
            words.append((current_start, current_word.strip()))

        result: list[str] = []
        prev_time = -999.0
        for word_time, word_text in words:
            if word_time - prev_time >= 2.0:
                result.append(f"[{word_time:.1f}s]")
            result.append(word_text)
            prev_time = word_time

        return " ".join(result)

    @staticmethod
    def strip_timestamps(transcript: str) -> str:
        return re.sub(r'\[\d+\.\d+s(?:-\d+\.\d+s)?\]\s*', '', transcript).strip()

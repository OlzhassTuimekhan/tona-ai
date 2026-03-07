import json
import logging
import subprocess
import tempfile
from pathlib import Path

from pydub import AudioSegment

logger = logging.getLogger(__name__)


class AudioProcessor:

    @staticmethod
    def get_duration(audio_path: Path) -> float:
        audio = AudioSegment.from_file(str(audio_path))
        return len(audio) / 1000.0

    @staticmethod
    def get_duration_from_url(audio_url: str) -> float | None:
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", audio_url],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if result.returncode == 0:
                return float(json.loads(result.stdout).get("format", {}).get("duration", 0))
        except Exception:
            pass
        return None

    @staticmethod
    def extract_segment(audio_url: str, start_sec: float, end_sec: float) -> Path | None:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            out_path = Path(tmp.name)

        try:
            duration = end_sec - start_sec
            if duration <= 0:
                duration = 1.0

            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    str(start_sec),
                    "-i",
                    audio_url,
                    "-t",
                    str(duration),
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    "-f",
                    "wav",
                    str(out_path),
                ],
                capture_output=True,
                timeout=120,
                check=True,
            )
            return out_path
        except Exception as e:
            logger.error(f"Failed to extract audio segment: {e}")
            out_path.unlink(missing_ok=True)
            return None


audio_processor = AudioProcessor()

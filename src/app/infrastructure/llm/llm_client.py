import json
import logging
from typing import Any, Optional

import openai

from app.domain.models import (
    ActionItem,
    AnalysisResult,
    Commitment,
    Decision,
    Speaker,
    Violation,
)

logger = logging.getLogger(__name__)

# OpenRouter default model IDs (see https://openrouter.ai/models )
_OPENROUTER_DEFAULT_MODEL = "google/gemini-2.0-flash-001"
_OPENROUTER_DEFAULT_FAST = "google/gemini-2.0-flash-001"

ANALYSIS_PROMPTS = {
    "general": """Ты — универсальный AI-аналитик аудиозаписей. Проведи полный анализ транскрипции.

Извлеки ВСЮ полезную информацию:
- Определи всех спикеров, их роли и кто что сказал
- Выдели ключевые тезисы и темы разговора
- Найди все обещания, обязательства, поручения (кто, что, кому, до когда)
- Найди все принятые решения
- Составь список задач/action items
- Выяви нарушения, проблемы, конфликты (если есть)
- Оцени тональность (позитивная, нейтральная, негативная, смешанная)
- Дай рекомендации
- Оцени риски (если есть)""",

    "meeting": """Ты — AI-аналитик совещаний и встреч государственных органов.

ФОКУС АНАЛИЗА:
- Обещания и поручения чиновников — ИЗВЛЕКИ ВСЕ с деталями: кто обещал, что именно, до когда, где
- Принятые решения — кто принял, какое решение, в каком контексте
- Задачи и ответственные — кто за что отвечает, какие сроки
- Проблемы, которые были подняты гражданами или участниками
- Тональность общения — уважительная, отписочная, конструктивная
- Риски невыполнения — есть ли нереалистичные обещания

Для каждого обещания/поручения ОБЯЗАТЕЛЬНО укажи:
- Точную цитату из транскрипции
- Временную метку (если доступна)
- Категорию: ремонт, строительство, социалка, образование, ЖКХ, транспорт, благоустройство, другое
- Приоритет: high/medium/low
- Ответственного (если упомянут)
- Дедлайн (если упомянут)
- Локацию (если упомянута)""",

    "court": """Ты — AI-аналитик судебных заседаний.

ФОКУС АНАЛИЗА:
- Все стороны процесса — судья, истец, ответчик, адвокаты, свидетели
- Ключевые аргументы каждой стороны
- Ссылки на законы, статьи, нормативные акты
- Решения и постановления суда
- Нарушения процедуры (если есть)
- Эмоциональная атмосфера — давление, объективность, предвзятость
- Рекомендации по дальнейшим действиям
- Документы, которые были упомянуты или запрошены""",

    "police": """Ты — AI-аналитик работы полицейских (аудиобейджик).

ФОКУС АНАЛИЗА:
- Поведение сотрудника: вежливость, профессионализм, следование протоколу
- Нарушения — грубость, превышение полномочий, непрофессионализм, коррупция
- Взаимодействие с гражданами — качество общения
- Выполнение инструкций и регламентов
- Приказы начальства — выполнены или нет
- Временные метки инцидентов
- Серьезность нарушений: critical/major/medium/minor

Для КАЖДОГО нарушения обязательно укажи:
- Точную цитату
- Временную метку
- Категорию нарушения
- Серьезность""",

    "call_center": """Ты — AI-аналитик качества обслуживания call-центра.

ФОКУС АНАЛИЗА:
- Обещания оператора гражданину — что пообещали, в какие сроки
- Качество обслуживания — вежливость, компетентность, эмпатия
- Решена ли проблема — да/нет/частично
- Нарушения протокола — приветствие, прощание, удержание на линии
- Тональность разговора
- Время ожидания и обработки
- Рекомендации по улучшению""",
}

OUTPUT_SCHEMA_DESCRIPTION = """
ФОРМАТ ОТВЕТА (строго JSON):
{
  "summary": "<краткое резюме в 2-5 предложениях>",
  "language_detected": "<основной язык: kk/ru/en/mixed>",
  "speakers": [
    {
      "id": "speaker_1",
      "label": "<Имя или роль, например 'Аким города'>",
      "role": "<роль: chairman/citizen/operator/judge/officer/witness/other>"
    }
  ],
  "key_points": ["<ключевой тезис 1>", "<ключевой тезис 2>"],
  "topics": ["<тема 1>", "<тема 2>"],
  "commitments": [
    {
      "description": "<что обещано>",
      "responsible": "<кто обещал>",
      "deadline": "<до когда, если указано>",
      "location": "<где, если указано>",
      "category": "<категория>",
      "priority": "high|medium|low",
      "quote": "<точная цитата из транскрипта>",
      "timestamp_start": <секунды, если доступно, иначе null>,
      "timestamp_end": <секунды, если доступно, иначе null>
    }
  ],
  "decisions": [
    {
      "description": "<описание решения>",
      "made_by": "<кто принял>",
      "quote": "<цитата>",
      "timestamp_start": <секунды или null>
    }
  ],
  "action_items": [
    {
      "description": "<что нужно сделать>",
      "responsible": "<кто отвечает>",
      "deadline": "<срок>",
      "priority": "high|medium|low"
    }
  ],
  "violations": [
    {
      "description": "<описание нарушения>",
      "severity": "critical|major|medium|minor",
      "speaker": "<кто нарушил>",
      "quote": "<цитата>",
      "timestamp_start": <секунды или null>,
      "timestamp_end": <секунды или null>,
      "category": "<категория нарушения>"
    }
  ],
  "recommendations": ["<рекомендация 1>", "<рекомендация 2>"],
  "sentiment": "positive|neutral|negative|mixed",
  "risk_assessment": "<оценка рисков, если есть, иначе null>"
}

СТРОГИЕ ПРАВИЛА:
- Верни ТОЛЬКО валидный JSON, без текста вокруг
- Не придумывай информацию — извлекай только то, что есть в транскрипте
- Если данных для поля нет — используй пустой список [] или null
- Цитаты бери дословно из транскрипта
- Временные метки из транскрипта в формате [123.4s]
"""


class LLMAnalyzer:

    def __init__(self, api_key: str, base_url: str | None = None, model: str | None = None, model_fast: str | None = None):
        if not base_url:
            if api_key.startswith("sk-or-v1-"):
                base_url = "https://openrouter.ai/api/v1"
            else:
                base_url = "https://api.openai.com/v1"

        self.base_url = base_url
        self.client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

        if model:
            self.model = model
        elif "openrouter" in base_url:
            self.model = _OPENROUTER_DEFAULT_MODEL
        else:
            self.model = "gpt-4o"

        self.model_fast = model_fast or (
            _OPENROUTER_DEFAULT_FAST if "openrouter" in base_url else "gpt-4o-mini"
        )

    async def analyze(
        self,
        transcript: str,
        *,
        analysis_type: str = "general",
        instructions: str | None = None,
        duration_seconds: float | None = None,
        language: str | None = None,
    ) -> AnalysisResult:
        system_prompt = self._build_prompt(analysis_type, instructions, duration_seconds, language)

        response = await self.client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            max_tokens=8000,
            temperature=0.1,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": transcript},
            ],
        )

        raw = response.choices[0].message.content
        usage = response.usage
        logger.info(
            f"LLM analysis done: {len(raw)} chars, "
            f"tokens={usage.total_tokens if usage else 'N/A'}"
        )

        return self._parse_response(raw, transcript, duration_seconds)

    def _build_prompt(
        self,
        analysis_type: str,
        instructions: str | None,
        duration_seconds: float | None,
        language: str | None,
    ) -> str:
        base = ANALYSIS_PROMPTS.get(analysis_type, ANALYSIS_PROMPTS["general"])

        parts = [base]

        if instructions:
            parts.append(f"\nДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ:\n{instructions}")

        if duration_seconds:
            parts.append(f"\nДлительность аудио: {duration_seconds:.0f} секунд ({duration_seconds/3600:.1f} часов).")

        lang_map = {"kk": "казахском", "ru": "русском", "en": "английском"}
        if language and language in lang_map:
            parts.append(f"\nОсновной язык: {lang_map[language]}. Но могут быть вставки на других языках.")
        else:
            parts.append("\nЯзык может быть казахским, русским, английским или смешанным.")

        parts.append(OUTPUT_SCHEMA_DESCRIPTION)

        return "\n".join(parts)

    _CITIZEN_FEEDBACK_DEFAULTS: dict[str, str] = {
        "was_there": "Я был на заседании / слышал своими ушами",
        "work_done": "Вижу в жизни: работу сделали",
        "dispute": "Здесь неточность или не так",
    }

    async def citizen_feedback_labels(self, context_text: str) -> dict[str, str]:
        defaults = dict(self._CITIZEN_FEEDBACK_DEFAULTS)
        system = """Ты генерируешь подписи для трёх кнопок гражданского отзыва о публичном заседании.

Семантика ключей (не меняй ключи):
- was_there: присутствие, личное участие или что слышал своими ушами на заседании
- work_done: подтверждение, что поручение/работа реально выполнена (видно в жизни)
- dispute: несогласие, ошибка или неточность в том, как сформулировано поручение/итог

Верни JSON-объект с ключами was_there, work_done, dispute. Значения — короткие фразы на русском (до 90 символов), привязанные к переданному контексту. Без вложенных кавычек в строках."""

        try:
            response = await self.client.chat.completions.create(
                model=self.model_fast,
                response_format={"type": "json_object"},
                max_tokens=400,
                temperature=0.35,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": context_text[:12000]},
                ],
            )
            raw = response.choices[0].message.content or "{}"
            data = json.loads(raw)
        except Exception as e:
            logger.warning("citizen_feedback_labels LLM failed: %s", e)
            return defaults

        out = dict(defaults)
        if not isinstance(data, dict):
            return out
        for k in out:
            v = data.get(k)
            if isinstance(v, str):
                t = v.strip()
                if t:
                    out[k] = t[:120]
        return out

    def _parse_response(self, raw: str, transcript: str, duration_seconds: float | None) -> AnalysisResult:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM JSON: {e}")
            return AnalysisResult(
                transcript=transcript,
                summary="Error: Failed to parse LLM response",
                duration_seconds=duration_seconds,
                raw_llm_response={"raw": raw[:2000]},
            )

        def parse_list(key: str, model_cls: type, fallback=None) -> list:
            items = data.get(key, fallback or [])
            if not isinstance(items, list):
                return []
            result = []
            for item in items:
                if isinstance(item, dict):
                    try:
                        result.append(model_cls(**item))
                    except Exception:
                        pass
                elif isinstance(item, str) and model_cls == str:
                    result.append(item)
            return result

        return AnalysisResult(
            transcript=transcript,
            summary=data.get("summary", ""),
            language_detected=data.get("language_detected"),
            duration_seconds=duration_seconds,
            speakers=parse_list("speakers", Speaker),
            key_points=data.get("key_points", []),
            commitments=parse_list("commitments", Commitment),
            decisions=parse_list("decisions", Decision),
            action_items=parse_list("action_items", ActionItem),
            violations=parse_list("violations", Violation),
            recommendations=data.get("recommendations", []),
            sentiment=data.get("sentiment", "neutral"),
            topics=data.get("topics", []),
            risk_assessment=data.get("risk_assessment"),
            raw_llm_response=data,
        )

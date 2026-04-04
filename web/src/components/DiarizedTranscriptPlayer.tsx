import { useEffect, useState, type RefObject } from 'react'

export type TranscriptSegmentRow = {
  speaker?: string | null
  start_sec: number
  end_sec: number
  text: string
}

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) ? sec : 0
  const s = Math.floor(safe % 60)
  const m = Math.floor(safe / 60) % 60
  const h = Math.floor(safe / 3600)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** playback_path из payload.metadata или прямой URL записи */
export function resolvePlaybackUrlFromPayload(
  payload: Record<string, unknown> | undefined,
): string | null {
  if (!payload) return null
  const meta = payload.metadata as Record<string, unknown> | undefined
  const p = meta?.playback_path
  if (typeof p === 'string' && p.trim()) {
    const t = p.trim()
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/')) return t
  }
  const au = meta?.audio_url
  if (typeof au === 'string' && (au.startsWith('http://') || au.startsWith('https://'))) {
    return au
  }
  return null
}

export function parseTranscriptSegments(
  payload: Record<string, unknown> | undefined,
): TranscriptSegmentRow[] {
  const raw = payload?.transcript_segments
  if (!Array.isArray(raw)) return []
  const out: TranscriptSegmentRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const start = Number(o.start_sec)
    const end = Number(o.end_sec)
    if (!Number.isFinite(start)) continue
    out.push({
      speaker: typeof o.speaker === 'string' ? o.speaker : o.speaker != null ? String(o.speaker) : null,
      start_sec: start,
      end_sec: Number.isFinite(end) ? end : start + 0.05,
      text: typeof o.text === 'string' ? o.text : '',
    })
  }
  return out
}

type DiarizedTranscriptPlayerProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  playbackSrc: string | null
  segments: TranscriptSegmentRow[]
}

export function DiarizedTranscriptPlayer({
  audioRef,
  playbackSrc,
  segments,
}: DiarizedTranscriptPlayerProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const seek = (t: number) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.max(0, t)
    void el.play().catch(() => {
      /* autoplay policy */
    })
  }

  useEffect(() => {
    const el = audioRef.current
    if (!el || segments.length === 0) {
      setActiveIdx(null)
      return
    }
    const sync = () => {
      const t = el.currentTime
      let idx: number | null = null
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i]
        if (t >= s.start_sec && t <= s.end_sec + 0.08) {
          idx = i
          break
        }
      }
      setActiveIdx(idx)
    }
    el.addEventListener('timeupdate', sync)
    el.addEventListener('seeked', sync)
    return () => {
      el.removeEventListener('timeupdate', sync)
      el.removeEventListener('seeked', sync)
    }
  }, [audioRef, segments])

  if (!playbackSrc && segments.length === 0) return null

  return (
    <div className="diarized-player">
      {playbackSrc ? (
        <audio
          ref={audioRef}
          className="diarized-player-audio"
          controls
          preload="metadata"
          src={playbackSrc}
        >
          Ваш браузер не воспроизводит audio.
        </audio>
      ) : null}
      {segments.length > 0 ? (
        <ul className="diarized-segments">
          {segments.map((s, i) => (
            <li
              key={`${s.start_sec}-${i}`}
              className={`diarized-segment-row${activeIdx === i ? ' diarized-segment-row-active' : ''}`}
            >
              <button
                type="button"
                className="diarized-segment-btn"
                disabled={!playbackSrc}
                title={playbackSrc ? 'Перейти к фрагменту в записи' : 'Нет URL записи для воспроизведения'}
                onClick={() => seek(s.start_sec)}
              >
                <span className="diarized-seg-time">
                  {formatTime(s.start_sec)}–{formatTime(s.end_sec)}
                </span>
                {s.speaker ? <span className="diarized-seg-spk">{s.speaker}</span> : null}
                <span className="diarized-seg-txt">{s.text || '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : playbackSrc ? (
        <p className="muted small">Для этой сессии нет сегментов с таймкодами (старая обработка или пустой ответ ASR).</p>
      ) : null}
    </div>
  )
}

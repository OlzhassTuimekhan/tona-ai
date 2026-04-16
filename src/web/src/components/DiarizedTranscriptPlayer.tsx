import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'

import { resolvePublicAssetUrl } from '@/config'

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

export function resolvePlaybackUrlFromPayload(
  payload: Record<string, unknown> | undefined,
): string | null {
  if (!payload) return null
  const meta = payload.metadata as Record<string, unknown> | undefined
  const p = meta?.playback_path
  if (typeof p === 'string' && p.trim()) {
    const t = p.trim()
    if (t.startsWith('http://') || t.startsWith('https://')) return t
    if (t.startsWith('/')) return resolvePublicAssetUrl(t)
  }
  const au = meta?.audio_url
  if (typeof au === 'string' && (au.startsWith('http://') || au.startsWith('https://'))) {
    return au
  }
  return null
}

export function seekAudioToTime(
  el: HTMLAudioElement | null,
  seconds: number,
  hintDurationSec?: number | null,
): void {
  const raw = Number(seconds)
  if (!el || !Number.isFinite(raw)) return

  const apply = () => {
    let sec = Math.max(0, raw)
    const dur = el.duration
    const hint = hintDurationSec != null && Number.isFinite(hintDurationSec) ? Number(hintDurationSec) : null

    if (Number.isFinite(dur) && dur > 0) {
      const metaLooksBroken = hint != null && hint > 10 && dur < hint * 0.25
      if (!metaLooksBroken && sec > dur - 0.05) {
        const capped = Math.max(0, dur - 0.05)
        if (!(capped < 0.05 && raw > 0.25)) {
          sec = capped
        }
      }
    }

    const playWhenReady = () => {
      void el.play().catch(() => {})
    }

    if (Math.abs(el.currentTime - sec) < 0.03) {
      playWhenReady()
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(fallbackTimer)
      playWhenReady()
    }
    el.addEventListener('seeked', finish, { once: true })
    const fallbackTimer = window.setTimeout(finish, 600)
    el.currentTime = sec
  }

  if (el.readyState >= 1) {
    apply()
  } else {
    el.addEventListener('loadedmetadata', apply, { once: true })
  }
}

function findActiveSegmentIndex(t: number, segs: TranscriptSegmentRow[]): number | null {
  if (!segs.length || !Number.isFinite(t)) return null
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const next = segs[i + 1]
    const endBound = next ? Math.min(s.end_sec, next.start_sec) : s.end_sec
    if (t + 1e-4 >= s.start_sec && t < endBound + 1e-3) {
      return i
    }
  }
  const last = segs[segs.length - 1]
  if (t >= last.start_sec) return segs.length - 1
  return null
}

function numField(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function readSegmentBoundsSec(o: Record<string, unknown>): { start: number; end: number } | null {
  const msS = numField(o.start_ms ?? o.start_time_ms ?? o.startMs ?? o.startTimeMs)
  const msE = numField(o.end_ms ?? o.end_time_ms ?? o.endMs ?? o.endTimeMs)
  if (msS != null) {
    const start = msS / 1000
    const end = msE != null ? msE / 1000 : start + 0.05
    return { start, end: Math.max(end, start + 0.05) }
  }

  let start = numField(o.start_sec ?? o.startSec ?? o.start ?? o.offset_sec ?? o.t0)
  let end = numField(o.end_sec ?? o.endSec ?? o.end ?? o.t1)
  if (start == null) return null
  if (end == null) end = start + 0.05
  return { start, end: Math.max(end, start + 0.05) }
}

export function parseTranscriptSegments(
  payload: Record<string, unknown> | undefined,
): TranscriptSegmentRow[] {
  const rawWords = payload?.transcript_word_segments
  const rawSpeaker = payload?.transcript_segments
  const raw = Array.isArray(rawWords) && rawWords.length > 0 ? rawWords : rawSpeaker
  if (!Array.isArray(raw)) return []
  const out: TranscriptSegmentRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const b = readSegmentBoundsSec(o)
    if (!b) continue
    out.push({
      speaker: typeof o.speaker === 'string' ? o.speaker : o.speaker != null ? String(o.speaker) : null,
      start_sec: b.start,
      end_sec: b.end,
      text: typeof o.text === 'string' ? o.text : '',
    })
  }
  return out
}

export function usesWordSegments(payload: Record<string, unknown> | undefined): boolean {
  const raw = payload?.transcript_word_segments
  return Array.isArray(raw) && raw.length > 0
}

type DiarizedTranscriptPlayerProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  playbackSrc: string | null
  segments: TranscriptSegmentRow[]
  hintDurationSec?: number | null
  wordStream?: boolean
}

export function DiarizedTranscriptPlayer({
  audioRef,
  playbackSrc,
  segments,
  hintDurationSec,
  wordStream = false,
}: DiarizedTranscriptPlayerProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [playheadSec, setPlayheadSec] = useState(0)

  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  const seek = (t: number) =>
    seekAudioToTime(audioRef.current, t, hintDurationSec ?? undefined)

  useEffect(() => {
    const el = audioRef.current
    if (!el || segments.length === 0) {
      setActiveIdx(null)
      setPlayheadSec(0)
      return
    }

    const sync = () => {
      const t = el.currentTime
      setPlayheadSec(t)
      setActiveIdx(findActiveSegmentIndex(t, segmentsRef.current))
    }

    let raf = 0
    const loop = () => {
      sync()
      if (!el.paused) {
        raf = requestAnimationFrame(loop)
      }
    }

    const onPlay = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    }
    const onPause = () => cancelAnimationFrame(raf)

    el.addEventListener('timeupdate', sync)
    el.addEventListener('seeked', sync)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    sync()

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('timeupdate', sync)
      el.removeEventListener('seeked', sync)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [audioRef, segments])

  useEffect(() => {
    if (activeIdx == null) return
    document.getElementById(`diarized-seg-${activeIdx}`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [activeIdx])

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
        wordStream ? (
          <div className="diarized-word-stream" role="region" aria-label="Транскрипт, клик по слову для перехода в записи">
            {segments.map((s, i) => {
              const prev = i > 0 ? segments[i - 1] : null
              const spk = s.speaker != null && String(s.speaker).trim() ? String(s.speaker) : null
              const prevSpk = prev?.speaker != null && String(prev.speaker).trim() ? String(prev.speaker) : null
              const showSpk = spk && spk !== prevSpk
              return (
                <Fragment key={`${s.start_sec}-${i}`}>
                  {i > 0 ? ' ' : null}
                  {showSpk ? (
                    <span className="diarized-inline-spk" title={spk}>
                      {spk}
                      {'\u00A0'}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    id={`diarized-seg-${i}`}
                    className={[
                      'diarized-token',
                      activeIdx === i ? 'diarized-token-active' : '',
                      playheadSec > s.end_sec + 0.02 && activeIdx !== i ? 'diarized-token-past' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!playbackSrc}
                    title={
                      playbackSrc
                        ? `${formatTime(s.start_sec)} — перейти к этому месту в записи`
                        : 'Нет URL записи'
                    }
                    onClick={(e) => {
                      e.preventDefault()
                      seek(Number(s.start_sec))
                    }}
                  >
                    {s.text || '\u00A0'}
                  </button>
                </Fragment>
              )
            })}
          </div>
        ) : (
          <ul className="diarized-segments">
            {segments.map((s, i) => (
              <li
                id={`diarized-seg-${i}`}
                key={`${s.start_sec}-${i}`}
                className={`diarized-segment-row${activeIdx === i ? ' diarized-segment-row-active' : ''}`}
              >
                <button
                  type="button"
                  className="diarized-segment-btn"
                  disabled={!playbackSrc}
                  title={playbackSrc ? 'Перейти к фрагменту в записи' : 'Нет URL записи для воспроизведения'}
                  onClick={(e) => {
                    e.preventDefault()
                    seek(Number(s.start_sec))
                  }}
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
        )
      ) : playbackSrc ? (
        <p className="muted small">Для этой сессии нет сегментов с таймкодами (старая обработка или пустой ответ ASR).</p>
      ) : null}
    </div>
  )
}

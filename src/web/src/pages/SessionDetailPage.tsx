import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getRegistrySession,
  publishRegistrySession,
  setCommitmentStatus,
  type RegistrySessionDoc,
} from '@/api/client'
import {
  DiarizedTranscriptPlayer,
  parseTranscriptSegments,
  resolvePlaybackUrlFromPayload,
  seekAudioToTime,
  usesWordSegments,
} from '@/components/DiarizedTranscriptPlayer'
import { CommitmentsEvidenceTable, DeadlineBadge, truncateText } from '@/components/jois-ui'
import { useAuth } from '@/context/AuthContext'

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [sessionDoc, setSessionDoc] = useState<RegistrySessionDoc | null>(null)
  const [regErr, setRegErr] = useState<string | null>(null)
  const [regBusy, setRegBusy] = useState(false)
  const [pubOrg, setPubOrg] = useState('')
  const [pubPublished, setPubPublished] = useState(false)
  const [pubSaving, setPubSaving] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!id) return
    let c = false
    getRegistrySession(id)
      .then((d) => {
        if (!c) {
          setSessionDoc(d)
          setRegErr(null)
        }
      })
      .catch((e) => {
        if (!c) setRegErr(String(e))
      })
    return () => {
      c = true
    }
  }, [id])

  useEffect(() => {
    if (!sessionDoc) return
    setPubOrg(sessionDoc.public_org ?? '')
    setPubPublished(!!sessionDoc.published)
  }, [sessionDoc])

  const applyPublish = async () => {
    if (!sessionDoc || !id) return
    setRegErr(null)
    setPubSaving(true)
    try {
      await publishRegistrySession(id, {
        published: pubPublished,
        public_org: pubOrg.trim() || null,
      })
      const d = await getRegistrySession(id)
      setSessionDoc(d)
    } catch (e) {
      setRegErr(String(e))
    } finally {
      setPubSaving(false)
    }
  }

  const payload = sessionDoc?.payload as Record<string, unknown> | undefined
  const commitments = Array.isArray(payload?.commitments)
    ? (payload!.commitments as Record<string, unknown>[])
    : []
  const playbackSrc = resolvePlaybackUrlFromPayload(payload)
  const transcriptSegments = useMemo(() => parseTranscriptSegments(payload), [sessionDoc])
  const hintDurationSec = (() => {
    const d = payload?.duration_seconds
    if (typeof d === 'number' && Number.isFinite(d)) return d
    if (typeof d === 'string') {
      const n = Number(d)
      return Number.isFinite(n) ? n : null
    }
    return null
  })()

  const seekTo = useCallback(
    (seconds: number) => {
      seekAudioToTime(audioRef.current, seconds, hintDurationSec)
    },
    [hintDurationSec],
  )

  if (!id) {
    return <p className="muted">Нет id</p>
  }

  return (
    <section className="panel">
      {regErr ? <p className="error panel-inline-err">{regErr}</p> : null}
      <div className="row space-between">
        <Link to="/registry" className="btn-link">
          ← К списку
        </Link>
      </div>
      {!sessionDoc ? (
        <p className="muted">Загрузка карточки…</p>
      ) : (
        <>
          <h2 className="panel-title">{sessionDoc.title}</h2>
          <p className="meta">
            {new Date(sessionDoc.created_at).toLocaleDateString()} · {sessionDoc.analysis_type}
            {sessionDoc.public_org ? ` · ${sessionDoc.public_org}` : ''}
          </p>
          <p className="summary-text">{(payload?.summary as string) || '—'}</p>
          {(playbackSrc || transcriptSegments.length > 0) && (
            <>
              <h3 className="subh">Запись и таймкоды (диаризация)</h3>
              <p className="muted small">
                Клик по фрагменту или по ▶ у поручения с таймкодом — переход к моменту в аудио.
              </p>
              <DiarizedTranscriptPlayer
                audioRef={audioRef}
                playbackSrc={playbackSrc}
                segments={transcriptSegments}
                hintDurationSec={hintDurationSec}
                wordStream={usesWordSegments(payload)}
              />
            </>
          )}
          <h3 className="subh">Поручения и доказательства</h3>
          <CommitmentsEvidenceTable
            commitments={commitments}
            emptyLabel="Нет блока commitments."
            onSeek={playbackSrc ? seekTo : undefined}
          />
          {commitments.length > 0 ? (
            <div className="fulfill-controls">
              <h3 className="subh">Статус выполнения</h3>
              <div className="fulfill-grid">
                {commitments.map((c, i) => {
                  const fs = String(c.fulfillment_status ?? 'pending')
                  const ds = String(c.deadline_status ?? '')
                  const isFulfilled = fs === 'fulfilled'
                  const isOverdue = ds === 'overdue'
                  const canFulfill = isAdmin || !isOverdue
                  const deadlineText = String(c.deadline ?? '').trim()
                  return (
                    <div
                      key={i}
                      className={`fulfill-row ${isFulfilled ? 'fulfill-row-done' : isOverdue ? 'fulfill-row-overdue' : ''}`}
                    >
                      <div className="fulfill-info">
                        <span className="fulfill-label">
                          <strong>#{i + 1}</strong> {truncateText(String(c.description ?? ''), 55)}
                        </span>
                        {(deadlineText || ds) && (
                          <span className="fulfill-deadline">
                            <DeadlineBadge status={ds || undefined} deadline={deadlineText} />
                          </span>
                        )}
                      </div>
                      {isFulfilled ? (
                        <button
                          type="button"
                          className="btn-sm btn-fulfilled"
                          disabled={regBusy}
                          onClick={() => {
                            if (!id) return
                            setRegBusy(true)
                            setRegErr(null)
                            setCommitmentStatus(id, i, 'pending')
                              .then(() => getRegistrySession(id).then(setSessionDoc))
                              .catch((e) => setRegErr(String(e)))
                              .finally(() => setRegBusy(false))
                          }}
                        >
                          Выполнено
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={isOverdue && !isAdmin ? 'btn-sm btn-disabled-overdue' : 'btn-sm btn-secondary'}
                          disabled={regBusy || !canFulfill}
                          title={!canFulfill ? 'Просроченное поручение может отметить только админ' : ''}
                          onClick={() => {
                            if (!id || !canFulfill) return
                            setRegBusy(true)
                            setRegErr(null)
                            setCommitmentStatus(id, i, 'fulfilled')
                              .then(() => getRegistrySession(id).then(setSessionDoc))
                              .catch((e) => setRegErr(String(e)))
                              .finally(() => setRegBusy(false))
                          }}
                        >
                          {isOverdue && !isAdmin ? 'Просрочено' : 'Отметить выполненным'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
          <h3 className="subh">Публикация для горожан</h3>
          <div className="publish-box">
            <label className="field check-row">
              <input
                type="checkbox"
                checked={pubPublished}
                onChange={(e) => setPubPublished(e.target.checked)}
              />
              <span>Показать всем на вкладке «Горожанам» (без входа)</span>
            </label>
            <label className="field">
              <span>Орган / контекст</span>
              <input
                type="text"
                value={pubOrg}
                onChange={(e) => setPubOrg(e.target.value)}
                placeholder="Например: Акимат г. Талдыкорган"
                maxLength={200}
              />
            </label>
            <button type="button" disabled={pubSaving} onClick={() => void applyPublish()}>
              {pubSaving ? 'Сохранение…' : 'Сохранить публикацию'}
            </button>
            {sessionDoc.published ? (
              <p className="muted small">
                Сейчас видно всем. Отметок горожан:{' '}
                {Array.isArray(sessionDoc.observations) ? sessionDoc.observations.length : 0}
              </p>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

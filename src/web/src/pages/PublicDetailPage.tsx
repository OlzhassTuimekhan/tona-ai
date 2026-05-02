import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  addPublicObservation,
  fetchFeedbackOptionLabels,
  getPublicSession,
  type FeedbackOptionLabels,
  type PublicSessionView,
} from '@/api/client'
import { resolvePublicAssetUrl } from '@/config'
import {
  DiarizedTranscriptPlayer,
  parseTranscriptSegments,
  seekAudioToTime,
} from '@/components/DiarizedTranscriptPlayer'
import { DeadlineBadge, FulfillmentBadge, RatingBadge } from '@/components/jois-ui'
import {
  describeRecordingError,
  getRecordingEnvironmentHint,
  isMediaRecorderAvailable,
  requestMicrophoneAudio,
} from '@/utils/mic'
import { pickRecorderMime } from '@/utils/recorder'

export default function PublicDetailPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [publicDoc, setPublicDoc] = useState<PublicSessionView | null>(null)
  const [publicErr, setPublicErr] = useState<string | null>(null)

  const [obsType, setObsType] = useState<'was_there' | 'work_done' | 'dispute'>('work_done')
  const [obsCommitTarget, setObsCommitTarget] = useState<'all' | number>('all')
  const [obsNote, setObsNote] = useState('')
  const [obsPhotoFile, setObsPhotoFile] = useState<File | null>(null)
  const [obsPhotoPreview, setObsPhotoPreview] = useState<string | null>(null)
  const [obsHp, setObsHp] = useState('')

  const publicAudioRef = useRef<HTMLAudioElement>(null)
  const obsRecRef = useRef<MediaRecorder | null>(null)
  const obsChunksRef = useRef<BlobPart[]>([])
  const obsStreamRef = useRef<MediaStream | null>(null)
  const [obsRecording, setObsRecording] = useState(false)
  const [obsRecSec, setObsRecSec] = useState(0)
  const [obsVoiceBlob, setObsVoiceBlob] = useState<Blob | null>(null)
  const [obsVoiceLabel, setObsVoiceLabel] = useState<string | null>(null)
  const [obsSubmitting, setObsSubmitting] = useState(false)

  const [feedbackLabels, setFeedbackLabels] = useState<FeedbackOptionLabels | null>(null)
  const [feedbackLabelsLoading, setFeedbackLabelsLoading] = useState(false)

  const feedbackDefaults = useMemo(
    (): FeedbackOptionLabels => ({
      was_there: t('publicDetail.feedbackDefault.was_there'),
      work_done: t('publicDetail.feedbackDefault.work_done'),
      dispute: t('publicDetail.feedbackDefault.dispute'),
    }),
    [t],
  )

  const micEnvHint = useMemo(() => getRecordingEnvironmentHint(), [i18n.language])

  useEffect(() => {
    if (!id) return
    let c = false
    getPublicSession(id)
      .then((d) => {
        if (!c) {
          setPublicDoc(d)
          setPublicErr(null)
        }
      })
      .catch((e) => {
        if (!c) setPublicErr(String(e))
      })
    return () => {
      c = true
    }
  }, [id])

  useEffect(() => {
    setObsVoiceBlob(null)
    setObsVoiceLabel(null)
    setObsRecSec(0)
    setObsRecording(false)
    setObsCommitTarget('all')
    setFeedbackLabels(null)
  }, [id])

  useEffect(() => {
    if (!id || !publicDoc) return
    let cancelled = false
    const target = obsCommitTarget === 'all' ? 'all' : obsCommitTarget
    setFeedbackLabelsLoading(true)
    fetchFeedbackOptionLabels(id, target)
      .then((labels) => {
        if (!cancelled) setFeedbackLabels(labels)
      })
      .catch(() => {
        if (!cancelled) setFeedbackLabels(null)
      })
      .finally(() => {
        if (!cancelled) setFeedbackLabelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, publicDoc, obsCommitTarget])

  useEffect(() => {
    if (!obsRecording) return
    const tid = window.setInterval(() => setObsRecSec((s) => s + 1), 1000)
    return () => window.clearInterval(tid)
  }, [obsRecording])

  useEffect(() => {
    return () => {
      obsStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (obsRecRef.current?.state === 'recording') {
        try {
          obsRecRef.current.stop()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  const startObsVoice = async () => {
    setPublicErr(null)
    setObsVoiceBlob(null)
    setObsVoiceLabel(null)
    obsChunksRef.current = []
    setObsRecSec(0)
    try {
      if (!isMediaRecorderAvailable()) {
        setPublicErr(t('publicDetail.micBlocked'))
        return
      }
      const stream = await requestMicrophoneAudio({
        echoCancellation: true,
        noiseSuppression: true,
      })
      obsStreamRef.current = stream
      const mime = pickRecorderMime()
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      obsRecRef.current = rec
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) obsChunksRef.current.push(ev.data)
      }
      rec.start(250)
      setObsRecording(true)
    } catch (e) {
      setPublicErr(describeRecordingError(e))
    }
  }

  const stopObsVoice = () => {
    const rec = obsRecRef.current
    const stream = obsStreamRef.current
    if (!rec || rec.state === 'inactive') {
      setObsRecording(false)
      stream?.getTracks().forEach((t) => t.stop())
      obsStreamRef.current = null
      return
    }
    rec.onstop = () => {
      const mime = rec.mimeType || 'audio/webm'
      const blob = new Blob(obsChunksRef.current, { type: mime })
      setObsVoiceBlob(blob)
      setObsVoiceLabel(
        t('publicDetail.recordingKb', { kb: Math.round(blob.size / 1024).toString() }),
      )
      stream?.getTracks().forEach((t) => t.stop())
      obsStreamRef.current = null
      obsRecRef.current = null
      setObsRecording(false)
    }
    rec.stop()
  }

  const submitObservation = async () => {
    if (!id) return
    setPublicErr(null)
    setObsSubmitting(true)
    try {
      const idx: number | null = obsCommitTarget === 'all' ? null : obsCommitTarget
      if (!obsVoiceBlob || obsVoiceBlob.size < 100) {
        throw new Error(t('publicDetail.robotPhraseError'))
      }
      const mime = obsVoiceBlob.type || 'audio/webm'
      const ext = mime.includes('webm')
        ? 'webm'
        : mime.includes('mp4')
          ? 'm4a'
          : mime.includes('ogg')
            ? 'ogg'
            : 'webm'
      await addPublicObservation(id, {
        observation_type: obsType,
        commitment_index: idx,
        note: obsNote.trim() || null,
        photo: obsPhotoFile,
        website: obsHp,
        humanVoice: obsVoiceBlob,
        humanVoiceFileName: `human-check-${Date.now()}.${ext}`,
      })
      setObsNote('')
      setObsPhotoFile(null)
      setObsPhotoPreview(null)
      setObsHp('')
      setObsVoiceBlob(null)
      setObsVoiceLabel(null)
      const d = await getPublicSession(id)
      setPublicDoc(d)
    } catch (e) {
      setPublicErr(String(e))
    } finally {
      setObsSubmitting(false)
    }
  }

  const publicHintDuration =
    publicDoc && typeof publicDoc.duration_seconds === 'number' && Number.isFinite(publicDoc.duration_seconds)
      ? publicDoc.duration_seconds
      : null

  const seekPublicAudio = useCallback(
    (seconds: number) => {
      seekAudioToTime(publicAudioRef.current, seconds, publicHintDuration)
    },
    [publicHintDuration],
  )

  const publicCommitments = Array.isArray(publicDoc?.commitments)
    ? (publicDoc!.commitments as Record<string, unknown>[])
    : []
  const publicObs = Array.isArray(publicDoc?.observations)
    ? (publicDoc!.observations as Record<string, unknown>[])
    : []

  const obsTypeLabel = (ot: unknown) => {
    if (ot === 'was_there') return t('publicDetail.obsWasThere')
    if (ot === 'work_done') return t('publicDetail.obsWorkDone')
    if (ot === 'dispute') return t('publicDetail.obsDispute')
    return String(ot)
  }

  if (!id) {
    return <p className="muted">{t('common.noId')}</p>
  }

  const lbl = feedbackLabels ?? feedbackDefaults

  return (
    <section className="panel panel-citizen public-detail">
      {publicErr ? <p className="error panel-inline-err">{publicErr}</p> : null}
      <div className="row space-between citizen-toolbar">
        <Link to="/public" className="btn-text">
          {t('common.backToList')}
        </Link>
      </div>
      {!publicDoc ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <div className="public-detail-layout">
          <div className="public-detail-main">
            <h2 className="panel-title panel-title-plain">{publicDoc.title}</h2>
            {publicDoc.public_org ? <p className="public-lead">{publicDoc.public_org}</p> : null}
            <p className="summary-text citizen-summary">{publicDoc.summary || t('common.dash')}</p>
            {(publicDoc.playback_url ||
              (Array.isArray(publicDoc.transcript_word_segments) && publicDoc.transcript_word_segments.length > 0) ||
              (Array.isArray(publicDoc.transcript_segments) && publicDoc.transcript_segments.length > 0)) && (
              <>
                <h3 className="subh subh-plain">{t('publicDetail.sessionRecording')}</h3>
                <p className="muted small">{t('publicDetail.sessionRecordingHint')}</p>
                <DiarizedTranscriptPlayer
                  audioRef={publicAudioRef}
                  playbackSrc={
                    typeof publicDoc.playback_url === 'string' && publicDoc.playback_url.trim()
                      ? resolvePublicAssetUrl(publicDoc.playback_url.trim())
                      : null
                  }
                  segments={parseTranscriptSegments({
                    transcript_word_segments: publicDoc.transcript_word_segments,
                    transcript_segments: publicDoc.transcript_segments,
                  })}
                  hintDurationSec={publicHintDuration}
                  wordStream={
                    Array.isArray(publicDoc.transcript_word_segments) &&
                    publicDoc.transcript_word_segments.length > 0
                  }
                />
              </>
            )}
            <details className="tech-fold">
              <summary>{t('publicDetail.cardId')}</summary>
              <p className="meta">
                <code>{publicDoc.id}</code>
              </p>
            </details>
            <h3 className="subh subh-plain">{t('publicDetail.perItem')}</h3>
            {(publicDoc.deadlines_overdue ?? 0) > 0 ? (
              <p className="overdue-summary">
                {t('publicDetail.overdueSummary', {
                  overdue: String(publicDoc.deadlines_overdue),
                  total: String(publicCommitments.length),
                })}
              </p>
            ) : null}
            {publicCommitments.length === 0 ? (
              <p className="muted">{t('publicDetail.noCommitmentSplit')}</p>
            ) : (
              <div className="commitment-cards">
                {publicCommitments.map((c, i) => (
                  <article
                    key={i}
                    className={[
                      'commitment-card',
                      obsCommitTarget === i ? 'commitment-card-selected' : '',
                      c.deadline_status === 'overdue' ? 'commitment-card-overdue' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    id={`commit-${i}`}
                  >
                    <div className="commitment-card-head">
                      <span className="commitment-num">{t('publicDetail.itemN', { n: i + 1 })}</span>
                      {typeof c.deadline_status === 'string' && c.deadline_status !== 'no_deadline' ? (
                        <DeadlineBadge status={c.deadline_status as string} deadline={String(c.deadline ?? '')} />
                      ) : null}
                    </div>
                    <p className="commitment-body">{String(c.description ?? t('common.dash'))}</p>
                    <FulfillmentBadge
                      fulfillment={String(c.fulfillment_status ?? 'pending')}
                      deadlineStatus={String(c.deadline_status ?? '')}
                    />
                    <p className="commitment-meta small">{String(c.responsible ?? t('common.dash'))}</p>
                    <div className="commitment-card-actions">
                      {typeof publicDoc.playback_url === 'string' &&
                      publicDoc.playback_url.trim() &&
                      typeof c.timestamp_start === 'number' &&
                      Number.isFinite(c.timestamp_start) ? (
                        <button
                          type="button"
                          className="btn-secondary btn-seek-inline"
                          onClick={() => seekPublicAudio(Number(c.timestamp_start))}
                        >
                          {t('publicDetail.seekRecording')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-commit-target"
                        onClick={() => {
                          setObsCommitTarget(i)
                          window.setTimeout(() => {
                            document.getElementById('citizen-reply')?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }, 0)
                        }}
                      >
                        {t('publicDetail.myFeedbackThis')}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {publicDoc.rating ? (
              <div className="session-rating-box">
                <RatingBadge rating={publicDoc.rating} size="large" />
                <span className="rating-stats">
                  {t('publicDetail.ratingStats', {
                    total: publicDoc.rating.total,
                    positive: publicDoc.rating.positive,
                    negative: publicDoc.rating.negative,
                  })}
                </span>
              </div>
            ) : null}

            <h3 className="subh subh-plain">{t('publicDetail.whatPeopleWrote')}</h3>
            {publicObs.length === 0 ? (
              <p className="muted">{t('publicDetail.noObsYet')}</p>
            ) : (
              <ul className="obs-list">
                {publicObs.map((o, i) => (
                  <li key={String(o.id ?? `obs-${i}`)} className={o.has_photo ? 'obs-item obs-with-photo' : 'obs-item'}>
                    {!!o.has_photo && <span className="obs-photo-badge">{t('publicDetail.withPhoto')}</span>}
                    <span className="muted nowrap">
                      {o.created_at ? new Date(String(o.created_at)).toLocaleString() : ''}
                    </span>{' '}
                    <strong>{obsTypeLabel(o.observation_type)}</strong>
                    {o.observer_display ? (
                      <span className="muted"> · {String(o.observer_display)}</span>
                    ) : null}
                    {o.commitment_index == null ? (
                      <span className="obs-scope">{t('publicDetail.obsScopeAll')}</span>
                    ) : publicCommitments[Number(o.commitment_index)] ? (
                      <span className="obs-scope">
                        {t('publicDetail.obsScopeItem', {
                          n: Number(o.commitment_index) + 1,
                          text: String(publicCommitments[Number(o.commitment_index)]?.description ?? ''),
                        })}
                      </span>
                    ) : (
                      <span className="obs-scope">
                        {t('publicDetail.obsScopeItemNum', { n: String(o.commitment_index) })}
                      </span>
                    )}
                    {o.note ? <> — {String(o.note)}</> : null}
                    {o.photo_url ? (
                      <div className="obs-photo-block">
                        <a href={String(o.photo_url)} target="_blank" rel="noreferrer">
                          <img
                            src={String(o.photo_url)}
                            alt={t('publicDetail.photoAlt')}
                            className="obs-photo-thumb"
                          />
                        </a>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="public-detail-aside" aria-label={t('publicDetail.yourReply')}>
            <h3 className="subh subh-plain public-detail-aside-title" id="citizen-reply">
              {t('publicDetail.yourReply')}
            </h3>
            <div className="obs-form">
              <input
                type="text"
                name="website"
                className="hp-field"
                tabIndex={-1}
                autoComplete="off"
                value={obsHp}
                onChange={(e) => setObsHp(e.target.value)}
                aria-hidden
              />
              <p className="field-hint field-hint-strong">{t('publicDetail.pickTarget')}</p>
              <div className="target-picker" role="group" aria-label={t('publicDetail.targetGroup')}>
                <button
                  type="button"
                  className={obsCommitTarget === 'all' ? 'target-chip active' : 'target-chip'}
                  onClick={() => setObsCommitTarget('all')}
                >
                  {t('publicDetail.wholeSession')}
                </button>
                {publicCommitments.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    className={obsCommitTarget === i ? 'target-chip active' : 'target-chip'}
                    onClick={() => setObsCommitTarget(i)}
                  >
                    {t('publicDetail.itemPick', {
                      n: i + 1,
                      text: String(c.description ?? ''),
                    })}
                  </button>
                ))}
              </div>
              <p className="field-hint">{t('publicDetail.sayAboutSelection')}</p>
              {feedbackLabelsLoading ? (
                <p className="muted small" style={{ marginBottom: '0.35rem' }}>
                  {t('publicDetail.pickingPhrases')}
                </p>
              ) : null}
              <div className="choice-grid" role="group" aria-label={t('publicDetail.responseType')}>
                <button
                  type="button"
                  className={obsType === 'was_there' ? 'choice-btn active' : 'choice-btn'}
                  onClick={() => setObsType('was_there')}
                >
                  {lbl.was_there}
                </button>
                <button
                  type="button"
                  className={obsType === 'work_done' ? 'choice-btn active' : 'choice-btn'}
                  onClick={() => setObsType('work_done')}
                >
                  {lbl.work_done}
                </button>
                <button
                  type="button"
                  className={obsType === 'dispute' ? 'choice-btn active' : 'choice-btn'}
                  onClick={() => setObsType('dispute')}
                >
                  {lbl.dispute}
                </button>
              </div>
              <label className="field field-plain">
                <span>{t('publicDetail.noteLabel')}</span>
                <textarea
                  value={obsNote}
                  onChange={(e) => setObsNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={t('publicDetail.notePh')}
                />
              </label>
              <div className="voice-card">
                <p className="voice-title">{t('publicDetail.sayInMic')}</p>
                <p className="voice-phrase">{t('publicDetail.robotPhrase')}</p>
                <p className="muted small">{t('publicDetail.voiceNote')}</p>
                {micEnvHint ? (
                  <p className="muted small" style={{ marginTop: '0.5rem' }}>
                    {micEnvHint}
                  </p>
                ) : null}
                <div className="voice-row">
                  {!obsRecording ? (
                    <button
                      type="button"
                      className="btn-record"
                      disabled={obsSubmitting || !!micEnvHint}
                      title={micEnvHint ?? undefined}
                      onClick={() => void startObsVoice()}
                    >
                      {t('publicDetail.recordVoice')}
                    </button>
                  ) : (
                    <button type="button" className="btn-record-stop" disabled={obsSubmitting} onClick={stopObsVoice}>
                      {t('publicDetail.stopSec', { sec: obsRecSec })}
                    </button>
                  )}
                  {obsRecording ? <span className="recording-dot" aria-hidden /> : null}
                </div>
                {obsVoiceLabel ? (
                  <p className="voice-ok">{obsVoiceLabel}</p>
                ) : (
                  <p className="muted small">{t('publicDetail.needVoice')}</p>
                )}
              </div>
              <button
                type="button"
                className="btn-block btn-send"
                disabled={obsSubmitting || !obsVoiceBlob || obsVoiceBlob.size < 100}
                onClick={() => void submitObservation()}
              >
                {obsSubmitting ? t('common.sending') : t('publicDetail.submit')}
              </button>
              <div className="photo-upload-block">
                <label className="field field-plain">
                  <span>{t('publicDetail.attachPhoto')}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setObsPhotoFile(f)
                      if (obsPhotoPreview) URL.revokeObjectURL(obsPhotoPreview)
                      setObsPhotoPreview(f ? URL.createObjectURL(f) : null)
                    }}
                  />
                </label>
                {obsPhotoPreview ? (
                  <div className="photo-preview-wrap">
                    <img src={obsPhotoPreview} alt={t('publicDetail.previewAlt')} className="photo-preview" />
                    <button
                      type="button"
                      className="btn-remove-photo"
                      onClick={() => {
                        if (obsPhotoPreview) URL.revokeObjectURL(obsPhotoPreview)
                        setObsPhotoFile(null)
                        setObsPhotoPreview(null)
                      }}
                    >
                      {t('publicDetail.removePhoto')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}

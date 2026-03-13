import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addPublicObservation, getPublicSession, type PublicSessionView } from '@/api/client'
import {
  DeadlineBadge,
  FulfillmentBadge,
  RatingBadge,
  truncateText,
} from '@/components/jois-ui'
import {
  describeRecordingError,
  getRecordingEnvironmentHint,
  isMediaRecorderAvailable,
  requestMicrophoneAudio,
} from '@/utils/mic'
import { pickRecorderMime } from '@/utils/recorder'

export default function PublicDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [publicDoc, setPublicDoc] = useState<PublicSessionView | null>(null)
  const [publicErr, setPublicErr] = useState<string | null>(null)

  const [obsType, setObsType] = useState<'was_there' | 'work_done' | 'dispute'>('work_done')
  const [obsCommitTarget, setObsCommitTarget] = useState<'all' | number>('all')
  const [obsNote, setObsNote] = useState('')
  const [obsPhotoFile, setObsPhotoFile] = useState<File | null>(null)
  const [obsPhotoPreview, setObsPhotoPreview] = useState<string | null>(null)
  const [obsHp, setObsHp] = useState('')

  const obsRecRef = useRef<MediaRecorder | null>(null)
  const obsChunksRef = useRef<BlobPart[]>([])
  const obsStreamRef = useRef<MediaStream | null>(null)
  const [obsRecording, setObsRecording] = useState(false)
  const [obsRecSec, setObsRecSec] = useState(0)
  const [obsVoiceBlob, setObsVoiceBlob] = useState<Blob | null>(null)
  const [obsVoiceLabel, setObsVoiceLabel] = useState<string | null>(null)
  const [obsSubmitting, setObsSubmitting] = useState(false)

  const micEnvHint = useMemo(() => getRecordingEnvironmentHint(), [])

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
  }, [id])

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
        setPublicErr(
          'В этом браузере недоступна запись голоса (нет MediaRecorder). Обновите браузер или откройте сайт с другого устройства.',
        )
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
      setObsVoiceLabel(`Запись есть (${(blob.size / 1024).toFixed(0)} КБ)`)
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
        throw new Error('Запишите голосом фразу «Я не робот» — кнопка ниже.')
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

  const publicCommitments = Array.isArray(publicDoc?.commitments)
    ? (publicDoc!.commitments as Record<string, unknown>[])
    : []
  const publicObs = Array.isArray(publicDoc?.observations)
    ? (publicDoc!.observations as Record<string, unknown>[])
    : []

  if (!id) {
    return <p className="muted">Нет id</p>
  }

  return (
    <section className="panel panel-citizen">
      {publicErr ? <p className="error panel-inline-err">{publicErr}</p> : null}
      <div className="row space-between citizen-toolbar">
        <Link to="/public" className="btn-text">
          ← Назад к списку
        </Link>
      </div>
      {!publicDoc ? (
        <p className="muted">Загрузка…</p>
      ) : (
        <>
          <h2 className="panel-title panel-title-plain">{publicDoc.title}</h2>
          {publicDoc.public_org ? <p className="public-lead">{publicDoc.public_org}</p> : null}
          <p className="summary-text citizen-summary">{publicDoc.summary || '—'}</p>
          <details className="tech-fold">
            <summary>Служебный номер карточки</summary>
            <p className="meta">
              <code>{publicDoc.id}</code>
            </p>
          </details>
          <h3 className="subh subh-plain">Поручения по отдельности</h3>
          {(publicDoc.deadlines_overdue ?? 0) > 0 ? (
            <p className="overdue-summary">
              {publicDoc.deadlines_overdue} из {publicCommitments.length} поручений просрочено
            </p>
          ) : null}
          {publicCommitments.length === 0 ? (
            <p className="muted">
              В этой записи нет разбивки на пункты — отзыв будет только «ко всему заседанию».
            </p>
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
                    <span className="commitment-num">Пункт {i + 1}</span>
                    {typeof c.deadline_status === 'string' && c.deadline_status !== 'no_deadline' ? (
                      <DeadlineBadge status={c.deadline_status as string} deadline={String(c.deadline ?? '')} />
                    ) : null}
                  </div>
                  <p className="commitment-body">{String(c.description ?? '—')}</p>
                  <FulfillmentBadge
                    fulfillment={String(c.fulfillment_status ?? 'pending')}
                    deadlineStatus={String(c.deadline_status ?? '')}
                  />
                  <p className="commitment-meta small">{String(c.responsible ?? '—')}</p>
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
                    Мой отзыв к этому пункту
                  </button>
                </article>
              ))}
            </div>
          )}
          {publicDoc.rating ? (
            <div className="session-rating-box">
              <RatingBadge rating={publicDoc.rating} size="large" />
              <span className="rating-stats">
                Отзывов: {publicDoc.rating.total} · Положительных: {publicDoc.rating.positive} · Оспариваний:{' '}
                {publicDoc.rating.negative}
              </span>
            </div>
          ) : null}

          <h3 className="subh subh-plain">Что уже написали люди</h3>
          {publicObs.length === 0 ? (
            <p className="muted">Пока никто не отметился.</p>
          ) : (
            <ul className="obs-list">
              {publicObs.map((o, i) => (
                <li key={String(o.id ?? `obs-${i}`)} className={o.has_photo ? 'obs-item obs-with-photo' : 'obs-item'}>
                  {!!o.has_photo && <span className="obs-photo-badge">С фото</span>}
                  <span className="muted nowrap">
                    {o.created_at ? new Date(String(o.created_at)).toLocaleString() : ''}
                  </span>{' '}
                  <strong>
                    {o.observation_type === 'was_there'
                      ? 'На встрече / слышал'
                      : o.observation_type === 'work_done'
                        ? 'Работа сделана'
                        : o.observation_type === 'dispute'
                          ? 'Оспаривание'
                          : String(o.observation_type)}
                  </strong>
                  {o.observer_display ? (
                    <span className="muted"> · {String(o.observer_display)}</span>
                  ) : null}
                  {o.commitment_index == null ? (
                    <span className="obs-scope"> · ко всему заседанию</span>
                  ) : publicCommitments[Number(o.commitment_index)] ? (
                    <span className="obs-scope">
                      {' '}
                      · пункт {Number(o.commitment_index) + 1}:{' '}
                      {truncateText(
                        String(publicCommitments[Number(o.commitment_index)]?.description ?? ''),
                        70,
                      )}
                    </span>
                  ) : (
                    <span className="obs-scope"> · пункт №{String(o.commitment_index)}</span>
                  )}
                  {o.note ? <> — {String(o.note)}</> : null}
                  {o.photo_url ? (
                    <div className="obs-photo-block">
                      <a href={String(o.photo_url)} target="_blank" rel="noreferrer">
                        <img src={String(o.photo_url)} alt="Фото к отзыву" className="obs-photo-thumb" />
                      </a>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h3 className="subh subh-plain" id="citizen-reply">
            Ваш ответ
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
            <p className="field-hint field-hint-strong">
              Сначала выберите, к чему относится отзыв — так не путают разные поручения.
            </p>
            <div className="target-picker" role="group" aria-label="К какому поручению относится отзыв">
              <button
                type="button"
                className={obsCommitTarget === 'all' ? 'target-chip active' : 'target-chip'}
                onClick={() => setObsCommitTarget('all')}
              >
                Ко всему заседанию целиком
              </button>
              {publicCommitments.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={obsCommitTarget === i ? 'target-chip active' : 'target-chip'}
                  onClick={() => setObsCommitTarget(i)}
                >
                  Пункт {i + 1}: {truncateText(String(c.description ?? ''), 52)}
                </button>
              ))}
            </div>
            <p className="field-hint">Что вы хотите сказать по выбранному</p>
            <div className="choice-grid" role="group" aria-label="Тип ответа">
              <button
                type="button"
                className={obsType === 'was_there' ? 'choice-btn active' : 'choice-btn'}
                onClick={() => setObsType('was_there')}
              >
                Я был на заседании / слышал своими ушами
              </button>
              <button
                type="button"
                className={obsType === 'work_done' ? 'choice-btn active' : 'choice-btn'}
                onClick={() => setObsType('work_done')}
              >
                Вижу в жизни: работу сделали
              </button>
              <button
                type="button"
                className={obsType === 'dispute' ? 'choice-btn active' : 'choice-btn'}
                onClick={() => setObsType('dispute')}
              >
                Здесь неточность или не так
              </button>
            </div>
            <label className="field field-plain">
              <span>Можно коротко пояснить</span>
              <textarea
                value={obsNote}
                onChange={(e) => setObsNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Необязательно"
              />
            </label>
            <div className="voice-card">
              <p className="voice-title">Скажите в микрофон</p>
              <p className="voice-phrase">«Я не робот»</p>
              <p className="muted small">Запись уйдёт на проверку — так мы отсекаем автоматические заявки.</p>
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
                    Записать голос
                  </button>
                ) : (
                  <button type="button" className="btn-record-stop" disabled={obsSubmitting} onClick={stopObsVoice}>
                    Стоп ({obsRecSec} сек)
                  </button>
                )}
                {obsRecording ? <span className="recording-dot" aria-hidden /> : null}
              </div>
              {obsVoiceLabel ? (
                <p className="voice-ok">{obsVoiceLabel}</p>
              ) : (
                <p className="muted small">Без записи отправить нельзя.</p>
              )}
            </div>
            <button
              type="button"
              className="btn-block btn-send"
              disabled={obsSubmitting || !obsVoiceBlob || obsVoiceBlob.size < 100}
              onClick={() => void submitObservation()}
            >
              {obsSubmitting ? 'Отправляем…' : 'Отправить'}
            </button>
            <div className="photo-upload-block">
              <label className="field field-plain">
                <span>Прикрепить фото (необязательно)</span>
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
                  <img src={obsPhotoPreview} alt="Превью" className="photo-preview" />
                  <button
                    type="button"
                    className="btn-remove-photo"
                    onClick={() => {
                      if (obsPhotoPreview) URL.revokeObjectURL(obsPhotoPreview)
                      setObsPhotoFile(null)
                      setObsPhotoPreview(null)
                    }}
                  >
                    Убрать фото
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

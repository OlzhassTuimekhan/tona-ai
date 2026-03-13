import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  enqueueFile,
  enqueueUrl,
  fetchProfiles,
  importRegistrySession,
  type JobPoll,
  type Profile,
} from '@/api/client'
import { CommitmentsEvidenceTable } from '@/components/jois-ui'
import { usePollJob } from '@/hooks/usePollJob'
import {
  describeRecordingError,
  getRecordingEnvironmentHint,
  isMediaRecorderAvailable,
  requestMicrophoneAudio,
} from '@/utils/mic'
import { pickRecorderMime } from '@/utils/recorder'
import { useAuth } from '@/context/AuthContext'

export default function AnalyzePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profile, setProfile] = useState('general')
  const [language, setLanguage] = useState('')
  const [instructions, setInstructions] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [job, setJob] = useState<JobPoll | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [regErr, setRegErr] = useState<string | null>(null)
  const [regBusy, setRegBusy] = useState(false)

  const onJobUpdate = useCallback((j: JobPoll) => {
    setJob(j)
  }, [])
  usePollJob(taskId, onJobUpdate)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaChunksRef = useRef<BlobPart[]>([])
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSec, setRecordingSec] = useState(0)
  const [recordedPreview, setRecordedPreview] = useState<string | null>(null)

  const micEnvHint = useMemo(() => getRecordingEnvironmentHint(), [])

  useEffect(() => {
    if (!isRecording) return
    const id = window.setInterval(() => setRecordingSec((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isRecording])

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
      if (mediaRecorderRef.current?.state === 'recording') {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          /* ignore */
        }
      }
    }
  }, [])

  const startRecording = async () => {
    setErr(null)
    setRecordedPreview(null)
    mediaChunksRef.current = []
    setRecordingSec(0)
    try {
      if (!isMediaRecorderAvailable()) {
        setErr(
          'В этом браузере недоступна запись звука (нет MediaRecorder). Загрузите аудиофайл ниже.',
        )
        return
      }
      const stream = await requestMicrophoneAudio({
        echoCancellation: true,
        noiseSuppression: true,
      })
      mediaStreamRef.current = stream
      const mime = pickRecorderMime()
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = rec
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) mediaChunksRef.current.push(ev.data)
      }
      rec.start(250)
      setIsRecording(true)
    } catch (e) {
      setErr(describeRecordingError(e))
    }
  }

  const stopRecording = () => {
    const rec = mediaRecorderRef.current
    const stream = mediaStreamRef.current
    if (!rec || rec.state === 'inactive') {
      setIsRecording(false)
      stream?.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
      return
    }
    rec.onstop = () => {
      const mime = rec.mimeType || 'audio/webm'
      const blob = new Blob(mediaChunksRef.current, { type: mime })
      const ext = mime.includes('webm')
        ? 'webm'
        : mime.includes('mp4')
          ? 'm4a'
          : mime.includes('ogg')
            ? 'ogg'
            : 'webm'
      const name = `recording-${Date.now()}.${ext}`
      const audioFile = new File([blob], name, { type: mime })
      setFile(audioFile)
      setRecordedPreview(`${name} (${(blob.size / 1024).toFixed(1)} КБ)`)
      stream?.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
      mediaRecorderRef.current = null
      setIsRecording(false)
    }
    rec.stop()
  }

  useEffect(() => {
    fetchProfiles()
      .then((p) => {
        let list = p
        if (Array.isArray(user?.allowed_analysis_types)) {
          const allow = user.allowed_analysis_types
          if (allow.length === 0) {
            list = []
          } else {
            const filtered = p.filter((x) => allow.includes(x.id))
            list = filtered.length ? filtered : p
          }
        }
        setProfiles(list)
        const first = list[0]?.id
        if (first) {
          setProfile((prev) => (list.some((x) => x.id === prev) ? prev : first))
        }
      })
      .catch(() => setProfiles([]))
  }, [user])

  const submitFile = async () => {
    if (isRecording) {
      setErr('Сначала остановите запись')
      return
    }
    if (!file) {
      setErr('Выберите файл или запишите с микрофона')
      return
    }
    setErr(null)
    setBusy(true)
    setJob(null)
    try {
      const r = await enqueueFile(file, {
        language: language || undefined,
        analysisType: profile,
        instructions: instructions || undefined,
      })
      setTaskId(r.task_id)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const submitUrl = async () => {
    if (!url.trim()) {
      setErr('Укажите URL аудио')
      return
    }
    setErr(null)
    setBusy(true)
    setJob(null)
    try {
      const r = await enqueueUrl(url.trim(), {
        language: language || undefined,
        analysisType: profile,
        instructions: instructions || undefined,
      })
      setTaskId(r.task_id)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const saveToRegistry = async () => {
    if (!taskId || job?.status !== 'completed') return
    setRegErr(null)
    setRegBusy(true)
    try {
      const r = await importRegistrySession(taskId, { analysisType: profile })
      if (r.duplicate) {
        setRegErr('Эта задача уже была в реестре — открыта существующая карточка.')
      }
      navigate(`/registry/${r.session_id}`)
    } catch (e) {
      setRegErr(String(e))
    } finally {
      setRegBusy(false)
    }
  }

  const jobResultPayload = job?.result as Record<string, unknown> | undefined
  const jobCommitments = Array.isArray(jobResultPayload?.commitments)
    ? (jobResultPayload.commitments as Record<string, unknown>[])
    : []

  return (
    <>
      <p className="tagline" style={{ marginBottom: '1.5rem' }}>
        Аудио заседания → поручения с цитатами из записи.
      </p>
      <section className="panel">
        <label className="field">
          <span>Профиль анализа</span>
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {profiles.length === 0 && (
              <>
                <option value="general">general</option>
                <option value="meeting">meeting</option>
              </>
            )}
          </select>
        </label>

        <label className="field">
          <span>Язык (опционально)</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">авто / hints</option>
            <option value="kk">Қазақша</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="field wide">
          <span>Доп. инструкции для модели</span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="Например: выделить только поручения с дедлайнами"
          />
        </label>

        <div className="record-block">
          <span className="field-label">Запись с микрофона</span>
          {micEnvHint ? (
            <p className="muted small" style={{ marginBottom: '0.65rem' }}>
              {micEnvHint}
            </p>
          ) : null}
          <div className="record-row">
            {!isRecording ? (
              <button
                type="button"
                className="btn-record"
                disabled={busy || !!micEnvHint}
                title={micEnvHint ?? undefined}
                onClick={() => void startRecording()}
              >
                Начать запись
              </button>
            ) : (
              <button
                type="button"
                className="btn-record-stop"
                disabled={busy}
                onClick={stopRecording}
              >
                Остановить ({Math.floor(recordingSec / 60)}:
                {(recordingSec % 60).toString().padStart(2, '0')})
              </button>
            )}
            {isRecording && <span className="recording-dot" aria-hidden />}
          </div>
          {recordedPreview && !isRecording && (
            <p className="record-hint">Готово к отправке: {recordedPreview}</p>
          )}
        </div>

        <div className="row">
          <label className="field grow">
            <span>Файл</span>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setRecordedPreview(null)
              }}
            />
          </label>
          <button type="button" disabled={busy || isRecording} onClick={() => void submitFile()}>
            В очередь (файл)
          </button>
        </div>

        <div className="row">
          <label className="field grow">
            <span>URL аудио</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void submitUrl()}>
            В очередь (URL)
          </button>
        </div>

        {err ? <p className="error">{err}</p> : null}
        {taskId ? (
          <p className="meta">
            task_id: <code>{taskId}</code>
          </p>
        ) : null}
      </section>

      <section className="panel result">
        <h2>Статус</h2>
        {regErr ? <p className="error panel-inline-err">{regErr}</p> : null}
        {!job ? <p className="muted">Результат появится после постановки задачи.</p> : null}
        {job ? (
          <>
            <p>
              <strong>{job.status}</strong>
            </p>
            {job.error ? <pre className="error">{job.error}</pre> : null}
            {job.result ? (
              <>
                <h3 className="subh">Кратко</h3>
                <p className="summary-text">{(jobResultPayload?.summary as string) || '—'}</p>
                <h3 className="subh">Поручения и доказательства</h3>
                <CommitmentsEvidenceTable commitments={jobCommitments} />
              </>
            ) : null}
            {job.status === 'completed' && taskId ? (
              <div className="registry-cta">
                <p className="muted small">
                  Сохранить в реестр: цитаты в поручениях сверяются с транскриптом (критерий хакатона —
                  explainability).
                </p>
                <button type="button" disabled={regBusy} onClick={() => void saveToRegistry()}>
                  В реестр
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  )
}

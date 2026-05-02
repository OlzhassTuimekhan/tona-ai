import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation()
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

  const jobStatusLabel = useCallback(
    (status: string) => {
      const key = `jobStatus.${status}` as const
      const tr = t(key)
      return tr === key ? status : tr
    },
    [t],
  )

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

  const micEnvHint = useMemo(() => getRecordingEnvironmentHint(), [i18n.language])

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
        setErr(t('analyze.micBlocked'))
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
      setRecordedPreview(
        t('analyze.recordReady', {
          name,
          kb: (blob.size / 1024).toFixed(1),
        }),
      )
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
      setErr(t('analyze.stopFirst'))
      return
    }
    if (!file) {
      setErr(t('analyze.needFile'))
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
      setErr(t('analyze.needUrl'))
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
        setRegErr(t('analyze.duplicateRegistry'))
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

  const fileReady = !!file && !isRecording

  const stopRecLabel = t('analyze.stopRecord', {
    m: Math.floor(recordingSec / 60).toString(),
    s: (recordingSec % 60).toString().padStart(2, '0'),
  })

  const profileLabel = (p: Profile) => {
    const tk = `analyze.profile.${p.id}` as const
    const tr = t(tk)
    return tr === tk ? p.label : tr
  }

  return (
    <div className="analyze-page">
      <header className="analyze-header">
        <h1 className="analyze-title">{t('analyze.title')}</h1>
        <p className="analyze-lead">{t('analyze.lead')}</p>
      </header>

      <details className="analyze-settings">
        <summary className="analyze-settings-summary">{t('analyze.settingsSummary')}</summary>
        <div className="analyze-settings-body">
          <label className="field">
            <span>{t('analyze.meetingType')}</span>
            <select value={profile} onChange={(e) => setProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {profileLabel(p)}
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
            <span>{t('analyze.speechLanguage')}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">{t('analyze.langAuto')}</option>
              <option value="kk">Қазақша</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field wide">
            <span>{t('analyze.instructions')}</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              placeholder={t('analyze.instructionsPh')}
            />
          </label>
        </div>
      </details>

      <div className="analyze-layout">
        <section className="analyze-card analyze-card--main" aria-labelledby="analyze-audio-heading">
          <h2 id="analyze-audio-heading" className="analyze-card-title">
            {t('analyze.fileOrRecord')}
          </h2>
          <p className="analyze-card-hint">{t('analyze.fileHint')}</p>

          <label className="field">
            <span>{t('analyze.fileFromPc')}</span>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setRecordedPreview(null)
              }}
            />
          </label>

          <div className="analyze-divider" role="presentation" />

          <div className="record-block analyze-mic">
            <span className="field-label">{t('analyze.micRecord')}</span>
            {micEnvHint ? <p className="muted small analyze-mic-note">{micEnvHint}</p> : null}
            <div className="record-row">
              {!isRecording ? (
                <button
                  type="button"
                  className="btn-record"
                  disabled={busy || !!micEnvHint}
                  title={micEnvHint ?? undefined}
                  onClick={() => void startRecording()}
                >
                  {t('analyze.startRecord')}
                </button>
              ) : (
                <button type="button" className="btn-record-stop" disabled={busy} onClick={stopRecording}>
                  {stopRecLabel}
                </button>
              )}
              {isRecording ? <span className="recording-dot" aria-hidden /> : null}
            </div>
            {recordedPreview && !isRecording ? (
              <p className="record-hint">{recordedPreview}</p>
            ) : null}
          </div>

          <div className="analyze-submit-file">
            <button
              type="button"
              className="analyze-btn-primary"
              disabled={busy || isRecording || !fileReady}
              onClick={() => void submitFile()}
            >
              {busy ? t('analyze.submitFileBusy') : t('analyze.submitFile')}
            </button>
            {!file && !isRecording ? (
              <p className="analyze-submit-hint muted small">{t('analyze.needFileOrRecord')}</p>
            ) : null}
          </div>
        </section>

        <section className="analyze-card" aria-labelledby="analyze-url-heading">
          <h2 id="analyze-url-heading" className="analyze-card-title">
            {t('analyze.pasteUrl')}
          </h2>
          <p className="analyze-card-hint">{t('analyze.urlHint')}</p>
          <label className="field">
            <span>{t('analyze.url')}</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('analyze.urlPh')}
            />
          </label>
          <button
            type="button"
            className="btn-secondary analyze-btn-url"
            disabled={busy}
            onClick={() => void submitUrl()}
          >
            {busy ? t('analyze.submitFileBusy') : t('analyze.submitUrl')}
          </button>
        </section>
      </div>

      {err ? <p className="error analyze-error">{err}</p> : null}

      <section className="panel analyze-result">
        <h2 className="analyze-result-title">{t('analyze.result')}</h2>
        {regErr ? <p className="error panel-inline-err">{regErr}</p> : null}
        {!job && !taskId ? (
          <p className="muted analyze-result-empty">{t('analyze.resultEmpty')}</p>
        ) : null}
        {taskId && !job ? (
          <p className="muted analyze-result-empty">{t('analyze.taskCreated')}</p>
        ) : null}
        {job ? (
          <>
            <p className="analyze-job-status">
              <span className="analyze-status-badge">{jobStatusLabel(job.status)}</span>
            </p>
            {job.error ? <pre className="error analyze-job-err">{job.error}</pre> : null}
            {taskId ? (
              <p className="muted small analyze-task-ref">
                {t('analyze.taskRef')} <code>{taskId}</code>
              </p>
            ) : null}
            {job.result ? (
              <>
                <h3 className="subh">{t('analyze.summary')}</h3>
                <p className="summary-text">
                  {(jobResultPayload?.summary as string) || t('common.dash')}
                </p>
                <h3 className="subh">{t('analyze.commitments')}</h3>
                <CommitmentsEvidenceTable commitments={jobCommitments} />
              </>
            ) : null}
            {job.status === 'completed' && taskId ? (
              <div className="registry-cta">
                <p className="muted small">{t('analyze.saveRegistryHint')}</p>
                <button type="button" disabled={regBusy} onClick={() => void saveToRegistry()}>
                  {regBusy ? t('analyze.saveRegistryBusy') : t('analyze.saveRegistry')}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  )
}

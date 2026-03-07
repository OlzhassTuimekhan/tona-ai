import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import {
  addPublicObservation,
  createUser,
  deleteUser,
  enqueueFile,
  enqueueUrl,
  fetchCities,
  fetchOrgRatings,
  fetchProfiles,
  fetchStats,
  getJob,
  getMe,
  getPublicSession,
  getRegistrySession,
  importRegistrySession,
  listPublicSessions,
  listRegistrySessions,
  listUsers,
  login,
  publishRegistrySession,
  setCommitmentStatus,
  setToken,
  fetchAdminDashboard,
  type AdminDashboard,
  type AuthUser,
  type JobPoll,
  type OrgRating,
  type PlatformStats,
  type Profile,
  type PublicSessionRow,
  type PublicSessionView,
  type RatingInfo,
  type RegistrySessionDoc,
  type RegistrySessionRow,
} from './api/client'

function DeadlineBadge({ status, deadline }: { status?: string; deadline?: string }) {
  const label = String(deadline ?? '').trim()
  if (status === 'fulfilled') {
    return (
      <span className="badge badge-fulfilled" title="Выполнено">
        {label ? `${label} — выполнено` : 'Выполнено'}
      </span>
    )
  }
  if (!label && (!status || status === 'no_deadline')) {
    return <span className="badge muted-badge">без срока</span>
  }
  if (status === 'overdue') {
    return <span className="badge badge-overdue" title="Срок истёк">{label || 'Просрочено'}</span>
  }
  if (status === 'upcoming') {
    return <span className="badge badge-upcoming" title="Скоро дедлайн">{label || 'Скоро'}</span>
  }
  if (status === 'ok' || label) {
    return <span className="badge badge-ok-deadline">{label}</span>
  }
  return <span className="badge muted-badge">без срока</span>
}

function FulfillmentBadge({ fulfillment, deadlineStatus }: { fulfillment?: string; deadlineStatus?: string }) {
  if (fulfillment === 'fulfilled') {
    return <span className="fulfillment-tag fulfillment-done">Аким: выполнено</span>
  }
  if (deadlineStatus === 'overdue') {
    return <span className="fulfillment-tag fulfillment-overdue">Просрочено</span>
  }
  if (fulfillment === 'pending' && (deadlineStatus === 'ok' || deadlineStatus === 'upcoming')) {
    return <span className="fulfillment-tag fulfillment-in-work">В работе</span>
  }
  return null
}

function CommitmentsEvidenceTable({
  commitments,
  emptyLabel = 'Нет поручений.',
}: {
  commitments: Record<string, unknown>[]
  emptyLabel?: string
}) {
  if (commitments.length === 0) {
    return <p className="muted">{emptyLabel}</p>
  }
  return (
    <table className="data-table commitments">
      <thead>
        <tr>
          <th>Суть</th>
          <th>Ответственный</th>
          <th>Срок</th>
          <th>Цитата</th>
          <th>Сверка</th>
        </tr>
      </thead>
      <tbody>
        {commitments.map((c, i) => {
          const ds = String(c.deadline_status ?? '')
          const isOverdue = ds === 'overdue'
          const isFulfilled = ds === 'fulfilled' || String(c.fulfillment_status ?? '') === 'fulfilled'
          return (
            <tr key={i} className={isOverdue ? 'row-overdue' : isFulfilled ? 'row-fulfilled' : ''}>
              <td>{String(c.description ?? '—')}</td>
              <td className="small">{String(c.responsible ?? '—')}</td>
              <td>
                <DeadlineBadge
                  status={ds || undefined}
                  deadline={String(c.deadline ?? '')}
                />
              </td>
              <td className="quote-cell">{String(c.quote ?? '—')}</td>
              <td>
                {c.evidence_note === 'нет_цитаты' ? (
                  <span className="badge muted-badge">нет цитаты</span>
                ) : c.evidence_verified === true ? (
                  <span className="badge ok">в тексте</span>
                ) : c.evidence_verified === false ? (
                  <span className="badge warn">не найдено</span>
                ) : (
                  <span className="badge">—</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RatingBadge({ rating, size = 'normal' }: { rating: RatingInfo | OrgRating; size?: 'normal' | 'large' }) {
  const cls = `rating-badge rating-${rating.level}${size === 'large' ? ' rating-large' : ''}`
  const labels: Record<string, string> = {
    green: 'Хорошо',
    yellow: 'На контроле',
    red: 'Требует внимания',
  }
  return (
    <span className={cls} title={`Оценка: ${rating.score}/100`}>
      <span className="rating-dot" />
      {labels[rating.level] ?? rating.level}
    </span>
  )
}

function truncateText(s: string, max: number): string {
  const t = s.trim()
  if (!t.length) return '—'
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function usePollJob(taskId: string | null, onDone: (j: JobPoll) => void) {
  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    const tick = async () => {
      try {
        const j = await getJob(taskId)
        if (cancelled) return
        onDone(j)
        if (j.status === 'pending' || j.status === 'processing') {
          setTimeout(tick, 2000)
        }
      } catch (e) {
        if (!cancelled)
          onDone({
            task_id: taskId,
            status: 'failed',
            error: String(e),
          })
      }
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [taskId, onDone])
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginErr, setLoginErr] = useState<string | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)

  const [adminUsersList, setAdminUsersList] = useState<AuthUser[]>([])
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminErr, setAdminErr] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'akim' | 'admin'>('akim')
  const [newOrg, setNewOrg] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newRegion, setNewRegion] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [availableCities, setAvailableCities] = useState<string[]>([])

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
  const [dashboardData, setDashboardData] = useState<AdminDashboard | null>(null)
  const [dashBusy, setDashBusy] = useState(false)

  const [page, setPage] = useState<
    'login' | 'analyze' | 'registry' | 'detail' | 'public' | 'publicDetail' | 'ratings' | 'admin' | 'dashboard'
  >('public')
  const [ratingFilter, setRatingFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all')
  const [orgRatings, setOrgRatings] = useState<OrgRating[]>([])
  const [sessions, setSessions] = useState<RegistrySessionRow[]>([])
  const [sessionDoc, setSessionDoc] = useState<RegistrySessionDoc | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [regErr, setRegErr] = useState<string | null>(null)
  const [regBusy, setRegBusy] = useState(false)
  const [archiveOrg, setArchiveOrg] = useState('')

  const [publicRows, setPublicRows] = useState<PublicSessionRow[]>([])
  const [publicDoc, setPublicDoc] = useState<PublicSessionView | null>(null)
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null)
  const [publicErr, setPublicErr] = useState<string | null>(null)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [publicBusy, setPublicBusy] = useState(false)

  const userRole = authUser?.role ?? null
  const isAdmin = userRole === 'admin'
  const isAkim = userRole === 'akim' || isAdmin

  const [pubOrg, setPubOrg] = useState('')
  const [pubPublished, setPubPublished] = useState(false)

  const [obsType, setObsType] = useState<
    'was_there' | 'work_done' | 'dispute'
  >('work_done')
  /** К какому поручению относится отзыв; в сессии может быть несколько — выбор явный */
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
  const [pubSaving, setPubSaving] = useState(false)
  const [obsSubmitting, setObsSubmitting] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('jois_token')
    if (!t) { setAuthChecked(true); return }
    getMe().then((u) => { setAuthUser(u); setAuthChecked(true) })
      .catch(() => { setToken(null); setAuthChecked(true) })
  }, [])

  const doLogin = async () => {
    setLoginErr(null)
    setLoginBusy(true)
    try {
      const res = await login(loginUsername, loginPassword)
      setToken(res.token)
      setAuthUser(res.user)
      setLoginUsername('')
      setLoginPassword('')
      setPage(res.user.role === 'admin' ? 'dashboard' : 'analyze')
    } catch (e) {
      setLoginErr(String(e))
    } finally {
      setLoginBusy(false)
    }
  }

  const doLogout = () => {
    setToken(null)
    setAuthUser(null)
    setPage('public')
  }

  const loadAdminUsers = useCallback(async () => {
    setAdminBusy(true)
    setAdminErr(null)
    try { setAdminUsersList(await listUsers()) }
    catch (e) { setAdminErr(String(e)) }
    finally { setAdminBusy(false) }
  }, [])

  const handleCreateUser = async () => {
    setAdminErr(null)
    setAdminBusy(true)
    try {
      await createUser({
        username: newUsername, password: newPassword, role: newRole,
        org: newOrg || undefined, city: newCity || undefined, region: newRegion || undefined,
      })
      setNewUsername(''); setNewPassword(''); setNewOrg(''); setNewCity(''); setNewRegion('')
      await loadAdminUsers()
    } catch (e) { setAdminErr(String(e)) }
    finally { setAdminBusy(false) }
  }

  const handleDeleteUser = async (id: string) => {
    setAdminErr(null)
    try { await deleteUser(id); await loadAdminUsers() }
    catch (e) { setAdminErr(String(e)) }
  }

  const loadRegistry = useCallback(async () => {
    setRegErr(null)
    setRegBusy(true)
    try {
      setSessions(await listRegistrySessions())
    } catch (e) {
      setRegErr(String(e))
    } finally {
      setRegBusy(false)
    }
  }, [])

  const loadPublic = useCallback(async () => {
    setPublicErr(null)
    setPublicBusy(true)
    try {
      const filters: Record<string, string> = {}
      if (cityFilter) filters.city = cityFilter
      if (searchQuery.trim()) filters.search = searchQuery.trim()
      setPublicRows(await listPublicSessions(filters))
    } catch (e) {
      setPublicErr(String(e))
    } finally {
      setPublicBusy(false)
    }
  }, [cityFilter, searchQuery])

  const loadRatings = useCallback(async () => {
    try {
      setOrgRatings(await fetchOrgRatings())
    } catch {
      setOrgRatings([])
    }
  }, [])

  useEffect(() => {
    if (page === 'registry') loadRegistry()
  }, [page, loadRegistry])

  useEffect(() => {
    if (page === 'public') {
      loadPublic()
      loadRatings()
      fetchCities().then((c) => setAvailableCities(c.cities)).catch(() => {})
      fetchStats().then(setPlatformStats).catch(() => {})
    }
  }, [page, loadPublic, loadRatings])

  useEffect(() => {
    if (page === 'ratings') loadRatings()
  }, [page, loadRatings])

  useEffect(() => {
    if (page === 'admin' && isAdmin) loadAdminUsers()
  }, [page, isAdmin, loadAdminUsers])

  const loadDashboard = useCallback(async () => {
    setDashBusy(true)
    try { setDashboardData(await fetchAdminDashboard()) }
    catch { setDashboardData(null) }
    finally { setDashBusy(false) }
  }, [])

  useEffect(() => {
    if (page === 'dashboard' && isAdmin) void loadDashboard()
  }, [page, isAdmin, loadDashboard])

  const filteredPublicRows = ratingFilter === 'all'
    ? publicRows
    : publicRows.filter((s) => s.rating?.level === ratingFilter)

  useEffect(() => {
    if (page !== 'publicDetail' || !selectedPublicId) {
      setPublicDoc(null)
      return
    }
    let c = false
    getPublicSession(selectedPublicId)
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
  }, [page, selectedPublicId])

  useEffect(() => {
    setObsVoiceBlob(null)
    setObsVoiceLabel(null)
    setObsRecSec(0)
    setObsRecording(false)
    setObsCommitTarget('all')
  }, [selectedPublicId])

  useEffect(() => {
    if (!obsRecording) return
    const id = window.setInterval(() => setObsRecSec((s) => s + 1), 1000)
    return () => window.clearInterval(id)
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

  useEffect(() => {
    if (page !== 'detail' || !selectedSessionId) {
      setSessionDoc(null)
      return
    }
    let cancelled = false
    getRegistrySession(selectedSessionId)
      .then((d) => {
        if (!cancelled) {
          setSessionDoc(d)
          setRegErr(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setRegErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [page, selectedSessionId])

  useEffect(() => {
    if (!sessionDoc) return
    setPubOrg(sessionDoc.public_org ?? '')
    setPubPublished(!!sessionDoc.published)
  }, [sessionDoc])

  const applyPublish = async () => {
    if (!sessionDoc) return
    setRegErr(null)
    setPubSaving(true)
    try {
      await publishRegistrySession(sessionDoc.id, {
        published: pubPublished,
        public_org: pubOrg.trim() || null,
      })
      const d = await getRegistrySession(sessionDoc.id)
      setSessionDoc(d)
      void loadRegistry()
    } catch (e) {
      setRegErr(String(e))
    } finally {
      setPubSaving(false)
    }
  }

  const submitObservation = async () => {
    if (!selectedPublicId) return
    setPublicErr(null)
    setObsSubmitting(true)
    try {
      const idx: number | null =
        obsCommitTarget === 'all' ? null : obsCommitTarget
      if (!obsVoiceBlob || obsVoiceBlob.size < 100) {
        throw new Error(
          'Запишите голосом фразу «Я не робот» — кнопка ниже.',
        )
      }
      const mime = obsVoiceBlob.type || 'audio/webm'
      const ext = mime.includes('webm')
        ? 'webm'
        : mime.includes('mp4')
          ? 'm4a'
          : mime.includes('ogg')
            ? 'ogg'
            : 'webm'
      await addPublicObservation(selectedPublicId, {
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
      const d = await getPublicSession(selectedPublicId)
      setPublicDoc(d)
    } catch (e) {
      setPublicErr(String(e))
    } finally {
      setObsSubmitting(false)
    }
  }

  const saveToRegistry = async () => {
    if (!taskId || job?.status !== 'completed') return
    setRegErr(null)
    setRegBusy(true)
    try {
      const r = await importRegistrySession(taskId, { analysisType: profile })
      setSelectedSessionId(r.session_id)
      setPage('detail')
      void loadRegistry()
      if (r.duplicate) {
        setRegErr('Эта задача уже была в реестре — открыта существующая карточка.')
      }
    } catch (e) {
      setRegErr(String(e))
    } finally {
      setRegBusy(false)
    }
  }

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

  function pickRecorderMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ]
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  const startRecording = async () => {
    setErr(null)
    setRecordedPreview(null)
    mediaChunksRef.current = []
    setRecordingSec(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
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
      setErr(
        'Нет доступа к микрофону (разрешите в браузере или используйте HTTPS). ' +
          String(e),
      )
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

  const startObsVoice = async () => {
    setPublicErr(null)
    setObsVoiceBlob(null)
    setObsVoiceLabel(null)
    obsChunksRef.current = []
    setObsRecSec(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
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
      setPublicErr(
        'Нужен доступ к микрофону (разрешите в браузере или откройте сайт по HTTPS). ' +
          String(e),
      )
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

  useEffect(() => {
    fetchProfiles()
      .then((p) => {
        setProfiles(p)
      })
      .catch(() => setProfiles([]))
  }, [])

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

  const payload = sessionDoc?.payload as
    | Record<string, unknown>
    | undefined
  const commitments = Array.isArray(payload?.commitments)
    ? (payload!.commitments as Record<string, unknown>[])
    : []
  const jobResultPayload = job?.result as Record<string, unknown> | undefined
  const jobCommitments = Array.isArray(jobResultPayload?.commitments)
    ? (jobResultPayload.commitments as Record<string, unknown>[])
    : []
  const publicCommitments = Array.isArray(publicDoc?.commitments)
    ? (publicDoc!.commitments as Record<string, unknown>[])
    : []
  const publicObs = Array.isArray(publicDoc?.observations)
    ? (publicDoc!.observations as Record<string, unknown>[])
    : []

  if (!authChecked) return <div className="shell"><p className="muted">Загрузка…</p></div>

  return (
    <div className="shell">
      <header className="top">
        <div className="top-row">
          <h1>JOIS</h1>
          <div className="auth-corner">
            {authUser ? (
              <>
                <span className="auth-info">
                  <span className={`role-badge role-${authUser.role}`}>{authUser.role}</span>
                  {authUser.username}
                </span>
                <button type="button" className="btn-secondary btn-sm" onClick={doLogout}>Выйти</button>
              </>
            ) : (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setPage('login')}>Войти</button>
            )}
          </div>
        </div>
        <p className="tagline">
          {page === 'public' || page === 'publicDetail'
            ? 'Открытые решения власти — ваш комментарий или отметка по факту.'
            : 'Аудио заседания → поручения с цитатами из записи.'}
        </p>
        <nav className="main-nav">
          {isAdmin && (
            <button
              type="button"
              className={page === 'dashboard' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => {
                setPage('dashboard')
                setRegErr(null)
                setPublicErr(null)
              }}
            >
              Дашборд
            </button>
          )}
          {isAkim && (
            <button
              type="button"
              className={page === 'analyze' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => {
                setPage('analyze')
                setSelectedSessionId(null)
                setRegErr(null)
                setPublicErr(null)
              }}
            >
              Запись
            </button>
          )}
          {isAkim && (
            <button
              type="button"
              className={page === 'registry' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => {
                setPage('registry')
                setSelectedSessionId(null)
                setRegErr(null)
                setPublicErr(null)
              }}
            >
              Архив
            </button>
          )}
          <button
            type="button"
            className={
              page === 'public' || page === 'publicDetail'
                ? 'nav-btn active'
                : 'nav-btn'
            }
            onClick={() => {
              setPage('public')
              setSelectedPublicId(null)
              setRegErr(null)
              setPublicErr(null)
              setRatingFilter('all')
            }}
          >
            Горожанам
          </button>
          <button
            type="button"
            className={page === 'ratings' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => {
              setPage('ratings')
              setRegErr(null)
              setPublicErr(null)
            }}
          >
            Рейтинг
          </button>
          {isAdmin && (
            <button
              type="button"
              className={page === 'admin' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => {
                setPage('admin')
                setRegErr(null)
                setPublicErr(null)
              }}
            >
              Пользователи
            </button>
          )}
        </nav>
      </header>

      {page === 'login' && (
        <section className="panel login-panel">
          <h2 className="panel-title">Вход в систему</h2>
          {loginErr && <p className="error panel-inline-err">{loginErr}</p>}
          <label className="field">
            <span>Логин</span>
            <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter') void doLogin() }}
            />
          </label>
          <button type="button" disabled={loginBusy || !loginUsername || !loginPassword} onClick={() => void doLogin()}>
            {loginBusy ? 'Вход…' : 'Войти'}
          </button>
          <p className="muted small" style={{ marginTop: '1rem' }}>
            Горожанам вход не нужен — вкладки «Горожанам» и «Рейтинг» доступны без аккаунта.
          </p>
        </section>
      )}

      {page === 'admin' && isAdmin && (
        <section className="panel">
          {adminErr && <p className="error panel-inline-err">{adminErr}</p>}
          <div className="row space-between">
            <h2 className="panel-title">Управление пользователями</h2>
            <button type="button" className="btn-secondary" disabled={adminBusy} onClick={() => void loadAdminUsers()}>Обновить</button>
          </div>
          <div className="admin-create-form">
            <h3 className="subh">Создать пользователя</h3>
            <div className="admin-form-grid">
              <label className="field"><span>Логин</span><input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></label>
              <label className="field"><span>Пароль</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
              <label className="field"><span>Роль</span>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'akim' | 'admin')}>
                  <option value="akim">akim</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label className="field"><span>Организация</span><input value={newOrg} onChange={(e) => setNewOrg(e.target.value)} placeholder="Акимат г. …" /></label>
              <label className="field"><span>Город</span><input value={newCity} onChange={(e) => setNewCity(e.target.value)} /></label>
              <label className="field"><span>Регион</span><input value={newRegion} onChange={(e) => setNewRegion(e.target.value)} /></label>
            </div>
            <button type="button" disabled={adminBusy || !newUsername || !newPassword} onClick={() => void handleCreateUser()}>
              {adminBusy ? 'Создание…' : 'Создать'}
            </button>
          </div>
          {adminUsersList.length > 0 && (
            <table className="data-table" style={{ marginTop: '1.5rem' }}>
              <thead><tr><th>Логин</th><th>Роль</th><th>Организация</th><th>Город</th><th>Регион</th><th /></tr></thead>
              <tbody>
                {adminUsersList.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                    <td>{u.org || '—'}</td>
                    <td>{u.city || '—'}</td>
                    <td>{u.region || '—'}</td>
                    <td>
                      {u.id !== authUser?.id && (
                        <button type="button" className="btn-link" style={{ color: 'var(--error)' }} onClick={() => void handleDeleteUser(u.id)}>Удалить</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {page === 'dashboard' && isAdmin && (
        <section className="panel dash-panel">
          <div className="row space-between">
            <h2 className="panel-title">Дашборд администратора</h2>
            <button type="button" className="btn-secondary" disabled={dashBusy} onClick={() => void loadDashboard()}>
              Обновить
            </button>
          </div>
          {!dashboardData && dashBusy && <p className="muted">Загрузка…</p>}
          {dashboardData && (
            <>
              <div className="dash-kpi-row">
                <div className="dash-kpi">
                  <span className="dash-kpi-num">{dashboardData.totals.published}</span>
                  <span className="dash-kpi-label">Опубликовано</span>
                </div>
                <div className="dash-kpi">
                  <span className="dash-kpi-num">{dashboardData.totals.sessions}</span>
                  <span className="dash-kpi-label">Всего сессий</span>
                </div>
                <div className="dash-kpi">
                  <span className="dash-kpi-num">{dashboardData.totals.commitments}</span>
                  <span className="dash-kpi-label">Поручений</span>
                </div>
                <div className="dash-kpi dash-kpi-good">
                  <span className="dash-kpi-num">{dashboardData.totals.fulfilled}</span>
                  <span className="dash-kpi-label">Выполнено</span>
                </div>
                <div className={`dash-kpi ${dashboardData.totals.overdue > 0 ? 'dash-kpi-alert' : ''}`}>
                  <span className="dash-kpi-num">{dashboardData.totals.overdue}</span>
                  <span className="dash-kpi-label">Просрочено</span>
                </div>
                <div className="dash-kpi">
                  <span className="dash-kpi-num">{dashboardData.totals.observations}</span>
                  <span className="dash-kpi-label">Отзывов</span>
                </div>
                <div className="dash-kpi">
                  <span className="dash-kpi-num">{dashboardData.totals.akims}</span>
                  <span className="dash-kpi-label">Акимов</span>
                </div>
              </div>

              {dashboardData.totals.commitments > 0 && (
                <div className="dash-progress-section">
                  <h3 className="subh">Общий прогресс поручений</h3>
                  <div className="dash-progress-bar">
                    <div
                      className="dash-progress-fill dash-fill-green"
                      style={{ width: `${Math.round(dashboardData.totals.fulfilled / dashboardData.totals.commitments * 100)}%` }}
                      title={`Выполнено: ${dashboardData.totals.fulfilled}`}
                    />
                    <div
                      className="dash-progress-fill dash-fill-red"
                      style={{ width: `${Math.round(dashboardData.totals.overdue / dashboardData.totals.commitments * 100)}%` }}
                      title={`Просрочено: ${dashboardData.totals.overdue}`}
                    />
                  </div>
                  <p className="dash-progress-legend">
                    <span className="legend-green">Выполнено {Math.round(dashboardData.totals.fulfilled / dashboardData.totals.commitments * 100)}%</span>
                    <span className="legend-red">Просрочено {Math.round(dashboardData.totals.overdue / dashboardData.totals.commitments * 100)}%</span>
                    <span className="legend-gray">В работе {Math.round((dashboardData.totals.commitments - dashboardData.totals.fulfilled - dashboardData.totals.overdue) / dashboardData.totals.commitments * 100)}%</span>
                  </p>
                </div>
              )}

              {dashboardData.orgs.length > 0 && (
                <>
                  <h3 className="subh">Организации</h3>
                  <div className="dash-orgs-grid">
                    {dashboardData.orgs.map((o) => {
                      const level = o.overdue > 0 ? (o.overdue_pct > 30 ? 'red' : 'yellow') : 'green'
                      return (
                        <div key={o.org} className={`dash-org-card dash-org-${level}`}>
                          <div className="dash-org-header">
                            <strong>{o.org}</strong>
                            {o.city && <span className="dash-org-city">{o.city}</span>}
                          </div>
                          <div className="dash-org-metrics">
                            <span>Сессий: {o.sessions}</span>
                            <span>Поручений: {o.commitments}</span>
                            <span className="dash-m-good">Выполнено: {o.fulfilled} ({o.fulfillment_pct}%)</span>
                            {o.overdue > 0 && <span className="dash-m-bad">Просрочено: {o.overdue} ({o.overdue_pct}%)</span>}
                            <span>Отзывов: {o.observations}</span>
                          </div>
                          <div className="dash-org-bar">
                            <div className="dash-org-fill-ok" style={{ width: `${o.fulfillment_pct}%` }} />
                            <div className="dash-org-fill-bad" style={{ width: `${o.overdue_pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {dashboardData.overdue_items.length > 0 && (
                <>
                  <h3 className="subh">Просроченные поручения</h3>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Организация</th>
                        <th>Сессия</th>
                        <th>Поручение</th>
                        <th>Ответственный</th>
                        <th>Срок</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.overdue_items.map((item, i) => (
                        <tr key={i} className="row-overdue">
                          <td className="small">{item.org}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-link"
                              onClick={() => {
                                setSelectedSessionId(item.session_id)
                                setPage('detail')
                              }}
                            >
                              {item.session_title || item.session_id.slice(0, 8)}
                            </button>
                          </td>
                          <td>{item.description}</td>
                          <td className="small">{item.responsible || '—'}</td>
                          <td className="small nowrap">{item.deadline || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </section>
      )}

      {page === 'registry' && (() => {
        const orgGroups: Record<string, typeof sessions> = {}
        if (isAdmin) {
          for (const s of sessions) {
            const key = s.public_org || 'Без организации'
            ;(orgGroups[key] ??= []).push(s)
          }
        }
        const orgNames = Object.keys(orgGroups).sort((a, b) =>
          a === 'Без организации' ? 1 : b === 'Без организации' ? -1 : a.localeCompare(b)
        )
        const [archiveOrgFilter, setArchiveOrgFilter] = [archiveOrg, setArchiveOrg]
        const visibleSessions = isAdmin && archiveOrgFilter
          ? sessions.filter((s) => (s.public_org || 'Без организации') === archiveOrgFilter)
          : sessions

        return (
          <section className="panel">
            {regErr && (
              <p className="error panel-inline-err">{regErr}</p>
            )}
            <div className="row space-between">
              <h2 className="panel-title">Сохранённые карточки</h2>
              <button
                type="button"
                disabled={regBusy}
                onClick={() => loadRegistry()}
              >
                Обновить
              </button>
            </div>

            {isAdmin && orgNames.length > 1 && (
              <div className="archive-org-nav">
                <button
                  type="button"
                  className={!archiveOrgFilter ? 'org-tab org-tab-active' : 'org-tab'}
                  onClick={() => setArchiveOrgFilter('')}
                >
                  Все ({sessions.length})
                </button>
                {orgNames.map((org) => (
                  <button
                    key={org}
                    type="button"
                    className={archiveOrgFilter === org ? 'org-tab org-tab-active' : 'org-tab'}
                    onClick={() => setArchiveOrgFilter(org)}
                  >
                    {org} ({orgGroups[org].length})
                  </button>
                ))}
              </div>
            )}

            {regBusy && sessions.length === 0 ? (
              <p className="muted">Загрузка…</p>
            ) : visibleSessions.length === 0 ? (
              <p className="muted">
                {archiveOrgFilter
                  ? `Нет карточек для «${archiveOrgFilter}».`
                  : 'Пока пусто. Завершите разбор на вкладке «Запись» и нажмите «В реестр».'}
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Заголовок</th>
                    {isAdmin && !archiveOrgFilter && <th>Организация</th>}
                    <th>Профиль</th>
                    <th>Поручения (✓ цитата)</th>
                    <th>Опубликовано</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map((s) => (
                    <tr key={s.id}>
                      <td className="nowrap">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td>{s.title}</td>
                      {isAdmin && !archiveOrgFilter && (
                        <td className="small">{s.public_org || '—'}</td>
                      )}
                      <td>{s.analysis_type}</td>
                      <td>
                        {s.commitments_verified_quotes}/{s.commitments_total}
                      </td>
                      <td>
                        {s.published ? (
                          <span className="badge ok">да</span>
                        ) : (
                          <span className="badge muted-badge">нет</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setSelectedSessionId(s.id)
                            setPage('detail')
                          }}
                        >
                          Открыть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )
      })()}

      {page === 'detail' && (
        <section className="panel">
          {regErr && (
            <p className="error panel-inline-err">{regErr}</p>
          )}
          <div className="row space-between">
            <button
              type="button"
              className="nav-btn"
              onClick={() => {
                setPage('registry')
                setSelectedSessionId(null)
                setPublicErr(null)
              }}
            >
              ← К списку
            </button>
          </div>
          {!sessionDoc ? (
            <p className="muted">Загрузка карточки…</p>
          ) : (
            <>
              <h2 className="panel-title">{sessionDoc.title}</h2>
              <p className="meta">
                {new Date(sessionDoc.created_at).toLocaleDateString()} · {sessionDoc.analysis_type}
                {sessionDoc.public_org && ` · ${sessionDoc.public_org}`}
              </p>
              <p className="summary-text">
                {(payload?.summary as string) || '—'}
              </p>
              <h3 className="subh">Поручения и доказательства</h3>
              <CommitmentsEvidenceTable
                commitments={commitments}
                emptyLabel="Нет блока commitments."
              />
              {commitments.length > 0 && (
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
                        <div key={i} className={`fulfill-row ${isFulfilled ? 'fulfill-row-done' : isOverdue ? 'fulfill-row-overdue' : ''}`}>
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
                                if (!selectedSessionId) return
                                setRegBusy(true)
                                setRegErr(null)
                                setCommitmentStatus(selectedSessionId, i, 'pending')
                                  .then(() => getRegistrySession(selectedSessionId).then(setSessionDoc))
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
                              disabled={regBusy || (!canFulfill)}
                              title={!canFulfill ? 'Просроченное поручение может отметить только админ' : ''}
                              onClick={() => {
                                if (!selectedSessionId || !canFulfill) return
                                setRegBusy(true)
                                setRegErr(null)
                                setCommitmentStatus(selectedSessionId, i, 'fulfilled')
                                  .then(() => getRegistrySession(selectedSessionId).then(setSessionDoc))
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
              )}
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
                    value={pubOrg}
                    onChange={(e) => setPubOrg(e.target.value)}
                    placeholder="Например: Акимат г. Талдыкорган"
                    maxLength={200}
                  />
                </label>
                <button
                  type="button"
                  disabled={pubSaving}
                  onClick={() => void applyPublish()}
                >
                  {pubSaving ? 'Сохранение…' : 'Сохранить публикацию'}
                </button>
                {sessionDoc.published ? (
                  <p className="muted small">
                    Сейчас видно всем. Отметок горожан:{' '}
                    {Array.isArray(sessionDoc.observations)
                      ? sessionDoc.observations.length
                      : 0}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </section>
      )}

      {page === 'public' && (
        <section className="panel panel-citizen">
          {platformStats && (
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hero-num">{platformStats.sessions}</span>
                <span className="hero-label">сессий обработано</span>
              </div>
              <div className="hero-stat">
                <span className="hero-num">{platformStats.commitments}</span>
                <span className="hero-label">поручений извлечено</span>
              </div>
              <div className="hero-stat">
                <span className="hero-num">{platformStats.observations}</span>
                <span className="hero-label">отзывов граждан</span>
              </div>
              {platformStats.overdue > 0 && (
                <div className="hero-stat hero-stat-alert">
                  <span className="hero-num">{platformStats.overdue}</span>
                  <span className="hero-label">просрочено</span>
                </div>
              )}
            </div>
          )}
          {publicErr && (
            <p className="error panel-inline-err">{publicErr}</p>
          )}
          <div className="row space-between citizen-toolbar">
            <h2 className="panel-title panel-title-plain">Что опубликовали</h2>
            <button
              type="button"
              className="btn-secondary"
              disabled={publicBusy}
              onClick={() => void loadPublic()}
            >
              Обновить список
            </button>
          </div>

          <div className="citizen-filters">
            <input
              className="search-input"
              type="text"
              placeholder="Поиск по названию, организации, городу…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void loadPublic() }}
            />
            <div className="filter-row">
              {availableCities.length > 0 && (
                <select className="city-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                  <option value="">Все города</option>
                  {availableCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <button type="button" className="btn-secondary btn-sm" disabled={publicBusy} onClick={() => void loadPublic()}>
                Найти
              </button>
              {(searchQuery || cityFilter) && (
                <button type="button" className="btn-text btn-sm" onClick={() => { setSearchQuery(''); setCityFilter(''); }}>
                  Сбросить
                </button>
              )}
            </div>
          </div>

          <div className="rating-filter-bar" role="group" aria-label="Фильтр по рейтингу">
            <button type="button" className={ratingFilter === 'all' ? 'filter-chip active' : 'filter-chip'} onClick={() => setRatingFilter('all')}>
              Все
            </button>
            <button type="button" className={ratingFilter === 'red' ? 'filter-chip filter-red active' : 'filter-chip filter-red'} onClick={() => setRatingFilter('red')}>
              Требует внимания
            </button>
            <button type="button" className={ratingFilter === 'yellow' ? 'filter-chip filter-yellow active' : 'filter-chip filter-yellow'} onClick={() => setRatingFilter('yellow')}>
              На контроле
            </button>
            <button type="button" className={ratingFilter === 'green' ? 'filter-chip filter-green active' : 'filter-chip filter-green'} onClick={() => setRatingFilter('green')}>
              Хорошо
            </button>
          </div>

          {publicBusy && publicRows.length === 0 ? (
            <p className="muted">Загрузка…</p>
          ) : filteredPublicRows.length === 0 ? (
            <p className="muted lead">
              {ratingFilter !== 'all'
                ? 'Нет сессий с таким рейтингом.'
                : 'Здесь появятся решения, когда их выложит администрация. Регистрация не нужна.'}
            </p>
          ) : (
            <div className="public-cards">
              {filteredPublicRows.map((s) => (
                <article key={s.id} className={`public-card public-card-${s.rating?.level ?? 'yellow'}`}>
                  <div className="public-card-header">
                    <h3 className="public-card-title">{s.title}</h3>
                    {s.rating && <RatingBadge rating={s.rating} />}
                  </div>
                  {s.public_org ? (
                    <p className="public-card-org">{s.public_org}</p>
                  ) : null}
                  <p className="public-card-meta">
                    {new Date(s.created_at).toLocaleDateString()} · поручений:{' '}
                    {s.commitments_total}
                    {s.observations_total > 0
                      ? ` · ответов: ${s.observations_total}`
                      : ''}
                    {s.observations_with_photo > 0
                      ? ` · с фото: ${s.observations_with_photo}`
                      : ''}
                  </p>
                  {s.deadlines_overdue > 0 && (
                    <p className="overdue-line">
                      {s.deadlines_overdue} {s.deadlines_overdue === 1 ? 'поручение просрочено' : 'поручений просрочено'}
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn-block"
                    onClick={() => {
                      setSelectedPublicId(s.id)
                      setPage('publicDetail')
                      setPublicErr(null)
                    }}
                  >
                    Открыть
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {page === 'publicDetail' && selectedPublicId && (
        <section className="panel panel-citizen">
          {publicErr && (
            <p className="error panel-inline-err">{publicErr}</p>
          )}
          <div className="row space-between citizen-toolbar">
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setPage('public')
                setSelectedPublicId(null)
                setPublicErr(null)
              }}
            >
              ← Назад к списку
            </button>
          </div>
          {!publicDoc ? (
            <p className="muted">Загрузка…</p>
          ) : (
            <>
              <h2 className="panel-title panel-title-plain">{publicDoc.title}</h2>
              {publicDoc.public_org ? (
                <p className="public-lead">{publicDoc.public_org}</p>
              ) : null}
              <p className="summary-text citizen-summary">
                {publicDoc.summary || '—'}
              </p>
              <details className="tech-fold">
                <summary>Служебный номер карточки</summary>
                <p className="meta">
                  <code>{publicDoc.id}</code>
                </p>
              </details>
              <h3 className="subh subh-plain">Поручения по отдельности</h3>
              {(publicDoc.deadlines_overdue ?? 0) > 0 && (
                <p className="overdue-summary">
                  {publicDoc.deadlines_overdue} из {publicCommitments.length} поручений просрочено
                </p>
              )}
              {publicCommitments.length === 0 ? (
                <p className="muted">
                  В этой записи нет разбивки на пункты — отзыв будет только «ко
                  всему заседанию».
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
                      ].filter(Boolean).join(' ')}
                      id={`commit-${i}`}
                    >
                      <div className="commitment-card-head">
                        <span className="commitment-num">Пункт {i + 1}</span>
                        {typeof c.deadline_status === 'string' && c.deadline_status !== 'no_deadline' && (
                          <DeadlineBadge
                            status={c.deadline_status}
                            deadline={String(c.deadline ?? '')}
                          />
                        )}
                      </div>
                      <p className="commitment-body">
                        {String(c.description ?? '—')}
                      </p>
                      <FulfillmentBadge
                        fulfillment={String(c.fulfillment_status ?? 'pending')}
                        deadlineStatus={String(c.deadline_status ?? '')}
                      />
                      <p className="commitment-meta small">
                        {String(c.responsible ?? '—')}
                      </p>
                      <button
                        type="button"
                        className="btn-commit-target"
                        onClick={() => {
                          setObsCommitTarget(i)
                          window.setTimeout(() => {
                            document
                              .getElementById('citizen-reply')
                              ?.scrollIntoView({
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
              {publicDoc.rating && (
                <div className="session-rating-box">
                  <RatingBadge rating={publicDoc.rating} size="large" />
                  <span className="rating-stats">
                    Отзывов: {publicDoc.rating.total} · Положительных: {publicDoc.rating.positive} · Оспариваний: {publicDoc.rating.negative}
                  </span>
                </div>
              )}

              <h3 className="subh subh-plain">Что уже написали люди</h3>
              {publicObs.length === 0 ? (
                <p className="muted">Пока никто не отметился.</p>
              ) : (
                <ul className="obs-list">
                  {publicObs.map((o, i) => (
                    <li key={String(o.id ?? `obs-${i}`)} className={o.has_photo ? 'obs-item obs-with-photo' : 'obs-item'}>
                      {!!o.has_photo && <span className="obs-photo-badge">С фото</span>}
                      <span className="muted nowrap">
                        {o.created_at
                          ? new Date(String(o.created_at)).toLocaleString()
                          : ''}
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
                      {o.commitment_index == null ? (
                        <span className="obs-scope">
                          {' '}
                          · ко всему заседанию
                        </span>
                      ) : publicCommitments[Number(o.commitment_index)] ? (
                        <span className="obs-scope">
                          {' '}
                          · пункт {Number(o.commitment_index) + 1}:{' '}
                          {truncateText(
                            String(
                              publicCommitments[Number(o.commitment_index)]
                                ?.description ?? '',
                            ),
                            70,
                          )}
                        </span>
                      ) : (
                        <span className="obs-scope">
                          {' '}
                          · пункт №{String(o.commitment_index)}
                        </span>
                      )}
                      {o.note ? <> — {String(o.note)}</> : null}
                      {o.photo_url ? (
                        <div className="obs-photo-block">
                          <a
                            href={String(o.photo_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <img
                              src={String(o.photo_url)}
                              alt="Фото к отзыву"
                              className="obs-photo-thumb"
                            />
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
                  Сначала выберите, к чему относится отзыв — так не путают разные
                  поручения.
                </p>
                <div
                  className="target-picker"
                  role="group"
                  aria-label="К какому поручению относится отзыв"
                >
                  <button
                    type="button"
                    className={
                      obsCommitTarget === 'all'
                        ? 'target-chip active'
                        : 'target-chip'
                    }
                    onClick={() => setObsCommitTarget('all')}
                  >
                    Ко всему заседанию целиком
                  </button>
                  {publicCommitments.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className={
                        obsCommitTarget === i
                          ? 'target-chip active'
                          : 'target-chip'
                      }
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
                    className={
                      obsType === 'was_there' ? 'choice-btn active' : 'choice-btn'
                    }
                    onClick={() => setObsType('was_there')}
                  >
                    Я был на заседании / слышал своими ушами
                  </button>
                  <button
                    type="button"
                    className={
                      obsType === 'work_done'
                        ? 'choice-btn active'
                        : 'choice-btn'
                    }
                    onClick={() => setObsType('work_done')}
                  >
                    Вижу в жизни: работу сделали
                  </button>
                  <button
                    type="button"
                    className={
                      obsType === 'dispute' ? 'choice-btn active' : 'choice-btn'
                    }
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
                  <p className="muted small">
                    Запись уйдёт на проверку — так мы отсекаем автоматические
                    заявки.
                  </p>
                  <div className="voice-row">
                    {!obsRecording ? (
                      <button
                        type="button"
                        className="btn-record"
                        disabled={obsSubmitting}
                        onClick={() => void startObsVoice()}
                      >
                        Записать голос
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-record-stop"
                        disabled={obsSubmitting}
                        onClick={stopObsVoice}
                      >
                        Стоп ({obsRecSec} сек)
                      </button>
                    )}
                    {obsRecording ? (
                      <span className="recording-dot" aria-hidden />
                    ) : null}
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
                  disabled={
                    obsSubmitting || !obsVoiceBlob || obsVoiceBlob.size < 100
                  }
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
                  {obsPhotoPreview && (
                    <div className="photo-preview-wrap">
                      <img
                        src={obsPhotoPreview}
                        alt="Превью"
                        className="photo-preview"
                      />
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
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {page === 'ratings' && (
        <section className="panel panel-citizen">
          <div className="row space-between citizen-toolbar">
            <h2 className="panel-title panel-title-plain">Рейтинг органов власти</h2>
            <button type="button" className="btn-secondary" onClick={() => void loadRatings()}>
              Обновить
            </button>
          </div>
          <p className="muted">
            Рейтинг формируется на основе отзывов горожан. Отзывы с фото имеют повышенный вес.
            Чем краснее рейтинг — тем больше внимания требуется.
          </p>
          {orgRatings.length === 0 ? (
            <p className="muted lead">Пока нет данных для рейтинга.</p>
          ) : (
            <div className="ratings-grid">
              {orgRatings.map((r) => (
                <article key={r.public_org} className={`rating-card rating-card-${r.level}`}>
                  <div className="rating-card-header">
                    <h3 className="rating-card-org">{r.public_org}</h3>
                    <RatingBadge rating={r} size="large" />
                  </div>
                  <div className="rating-card-score">
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${r.score}%` }} />
                    </div>
                    <span className="score-label">{r.score}/100</span>
                  </div>
                  <div className="rating-card-stats">
                    <span>Сессий: {r.sessions_count}</span>
                    <span>Отзывов: {r.observations_total}</span>
                    <span>С фото: {r.observations_with_photo}</span>
                  </div>
                  <div className="rating-card-breakdown">
                    <span className="stat-positive">Работа сделана: {r.positive}</span>
                    <span className="stat-neutral">Присутствовал: {r.neutral}</span>
                    <span className="stat-negative">Оспариваний: {r.negative}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-block"
                    onClick={() => {
                      setRatingFilter('all')
                      setSearchQuery(r.public_org)
                      setCityFilter('')
                      setPage('public')
                    }}
                  >
                    Посмотреть сессии
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {page === 'analyze' && (
        <>
      <section className="panel">
        <label className="field">
          <span>Профиль анализа</span>
          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          >
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
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
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
          <div className="record-row">
            {!isRecording ? (
              <button
                type="button"
                className="btn-record"
                disabled={busy}
                onClick={startRecording}
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
          <button type="button" disabled={busy || isRecording} onClick={submitFile}>
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
          <button type="button" disabled={busy} onClick={submitUrl}>
            В очередь (URL)
          </button>
        </div>

        {err && <p className="error">{err}</p>}
        {taskId && (
          <p className="meta">
            task_id: <code>{taskId}</code>
          </p>
        )}
      </section>

      <section className="panel result">
        <h2>Статус</h2>
        {regErr && page === 'analyze' && (
          <p className="error panel-inline-err">{regErr}</p>
        )}
        {!job && <p className="muted">Результат появится после постановки задачи.</p>}
        {job && (
          <>
            <p>
              <strong>{job.status}</strong>
            </p>
            {job.error && <pre className="error">{job.error}</pre>}
            {job.result && (
              <>
                <h3 className="subh">Кратко</h3>
                <p className="summary-text">
                  {(jobResultPayload?.summary as string) || '—'}
                </p>
                <h3 className="subh">Поручения и доказательства</h3>
                <CommitmentsEvidenceTable commitments={jobCommitments} />
              </>
            )}
            {job.status === 'completed' && taskId && (
              <div className="registry-cta">
                <p className="muted small">
                  Сохранить в реестр: цитаты в поручениях сверяются с
                  транскриптом (критерий хакатона — explainability).
                </p>
                <button
                  type="button"
                  disabled={regBusy}
                  onClick={() => void saveToRegistry()}
                >
                  В реестр
                </button>
              </div>
            )}
          </>
        )}
      </section>
        </>
      )}
    </div>
  )
}

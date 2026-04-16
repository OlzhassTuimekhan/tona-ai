import { API_V1 } from '@/config'

const API = API_V1

function getToken(): string | null {
  return localStorage.getItem('jois_token')
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem('jois_token', token)
  else localStorage.removeItem('jois_token')
}

function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function jsonAuth(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders() }
}

export type Profile = { id: string; label: string }

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | string

export type JobPoll = {
  task_id: string
  status: JobStatus
  result?: Record<string, unknown> | null
  error?: string | null
}

export type AuthUser = {
  id: string
  username: string
  role: string
  org?: string | null
  city?: string | null
  region?: string | null
  first_name?: string | null
  last_name?: string | null
  district?: string | null
  phone?: string | null
  allowed_analysis_types?: string[]
  role_label_ru?: string
}

export type RegisterBody = {
  username: string
  password: string
  first_name: string
  last_name: string
  district: string
  city?: string
  region?: string
  phone?: string
}

export type ProfileUpdate = {
  first_name?: string
  last_name?: string
  district?: string
  city?: string | null
  region?: string | null
  phone?: string | null
}

export async function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `login: ${r.status}`)
  }
  return r.json()
}

export async function getMe(): Promise<AuthUser> {
  const r = await fetch(`${API}/auth/me`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`me: ${r.status}`)
  return r.json()
}

export async function register(
  body: RegisterBody,
): Promise<{ token: string; user: AuthUser }> {
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `register: ${r.status}`)
  }
  return r.json()
}

export async function updateProfile(body: ProfileUpdate): Promise<AuthUser> {
  const r = await fetch(`${API}/auth/me`, {
    method: 'PATCH',
    headers: jsonAuth(),
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `profile: ${r.status}`)
  }
  return r.json()
}

export async function createUser(body: {
  username: string
  password: string
  role: string
  org?: string
  city?: string
  region?: string
}): Promise<AuthUser> {
  const r = await fetch(`${API}/admin/users`, {
    method: 'POST',
    headers: jsonAuth(),
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `createUser: ${r.status}`)
  }
  return r.json()
}

export async function listUsers(): Promise<AuthUser[]> {
  const r = await fetch(`${API}/admin/users`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`listUsers: ${r.status}`)
  const data = (await r.json()) as { users: AuthUser[] }
  return data.users
}

export async function deleteUser(userId: string): Promise<void> {
  const r = await fetch(`${API}/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `deleteUser: ${r.status}`)
  }
}

export async function fetchProfiles(): Promise<Profile[]> {
  const r = await fetch(`${API}/jobs/profiles`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`profiles: ${r.status}`)
  const data = (await r.json()) as { profiles: Profile[] }
  return data.profiles
}

export async function enqueueFile(
  file: File,
  opts: {
    language?: string
    analysisType: string
    instructions?: string
  },
): Promise<{ task_id: string }> {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.language) fd.append('language', opts.language)
  fd.append('analysis_type', opts.analysisType)
  if (opts.instructions) fd.append('instructions', opts.instructions)

  const r = await fetch(`${API}/jobs/file`, { method: 'POST', body: fd, headers: authHeaders() })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `enqueue: ${r.status}`)
  }
  return r.json()
}

export async function enqueueUrl(
  audioUrl: string,
  opts: {
    language?: string
    analysisType: string
    instructions?: string
  },
): Promise<{ task_id: string }> {
  const r = await fetch(`${API}/jobs/url`, {
    method: 'POST',
    headers: jsonAuth(),
    body: JSON.stringify({
      audio_url: audioUrl,
      language: opts.language || null,
      analysis_type: opts.analysisType,
      instructions: opts.instructions || null,
      webhook_url: null,
      metadata: {},
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `enqueue: ${r.status}`)
  }
  return r.json()
}

export async function getJob(taskId: string): Promise<JobPoll> {
  const r = await fetch(`${API}/jobs/${encodeURIComponent(taskId)}`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`job: ${r.status}`)
  return r.json()
}

export type RegistrySessionRow = {
  id: string
  task_id: string
  created_at: string
  title: string
  analysis_type: string
  commitments_total: number
  commitments_verified_quotes: number
  published?: boolean
  public_org?: string | null
}

export async function listRegistrySessions(): Promise<RegistrySessionRow[]> {
  const r = await fetch(`${API}/registry/sessions?limit=100`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`registry: ${r.status}`)
  const data = (await r.json()) as { sessions: RegistrySessionRow[] }
  return data.sessions
}

export async function importRegistrySession(
  taskId: string,
  opts?: { analysisType?: string; titleOverride?: string },
): Promise<{ session_id: string; duplicate: boolean }> {
  const r = await fetch(`${API}/registry/import`, {
    method: 'POST',
    headers: jsonAuth(),
    body: JSON.stringify({
      task_id: taskId,
      analysis_type: opts?.analysisType ?? null,
      title_override: opts?.titleOverride ?? null,
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `import: ${r.status}`)
  }
  return r.json()
}

export type RegistrySessionDoc = {
  id: string
  task_id: string
  created_at: string
  title: string
  analysis_type: string
  payload: Record<string, unknown>
  published?: boolean
  public_org?: string | null
  published_at?: string | null
  observations?: unknown[]
}

export async function publishRegistrySession(
  sessionId: string,
  body: { published: boolean; public_org?: string | null },
): Promise<{ published?: boolean; public_org?: string | null }> {
  const r = await fetch(
    `${API}/registry/sessions/${encodeURIComponent(sessionId)}/publish`,
    {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify(body),
    },
  )
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `publish: ${r.status}`)
  }
  return r.json()
}

export type RatingInfo = {
  level: 'green' | 'yellow' | 'red'
  score: number
  total: number
  positive: number
  negative: number
  neutral: number
}

export type OrgRating = {
  public_org: string
  city?: string | null
  region?: string | null
  level: 'green' | 'yellow' | 'red'
  score: number
  sessions_count: number
  observations_total: number
  observations_with_photo: number
  positive: number
  negative: number
  neutral: number
}

export type PublicSessionRow = {
  id: string
  created_at: string
  title: string
  public_org: string | null
  city?: string | null
  region?: string | null
  commitments_total: number
  observations_total: number
  observations_with_photo: number
  rating: RatingInfo
  deadlines_overdue: number
}

export type PlatformStats = {
  sessions: number
  commitments: number
  observations: number
  overdue: number
}

export type PublicFilters = {
  city?: string
  region?: string
  org?: string
  search?: string
}

export async function listPublicSessions(filters?: PublicFilters): Promise<PublicSessionRow[]> {
  const params = new URLSearchParams({ limit: '100' })
  if (filters?.city) params.set('city', filters.city)
  if (filters?.region) params.set('region', filters.region)
  if (filters?.org) params.set('org', filters.org)
  if (filters?.search) params.set('search', filters.search)
  const r = await fetch(`${API}/public/sessions?${params}`)
  if (!r.ok) throw new Error(`public: ${r.status}`)
  const data = (await r.json()) as { sessions: PublicSessionRow[] }
  return data.sessions
}

export type TranscriptSegmentApi = {
  speaker?: string | null
  start_sec: number
  end_sec: number
  text: string
}

export type PublicSessionView = {
  id: string
  title: string
  public_org: string | null
  city?: string | null
  region?: string | null
  created_at: string
  published_at?: string | null
  summary?: string
  duration_seconds?: number
  commitments: Record<string, unknown>[]
  observations: Record<string, unknown>[]
  rating?: RatingInfo
  normalized_transcript?: string
  deadlines_overdue?: number
  deadlines_upcoming?: number
  playback_url?: string | null
  transcript_segments?: TranscriptSegmentApi[]
  transcript_word_segments?: TranscriptSegmentApi[]
}

export async function getPublicSession(
  sessionId: string,
): Promise<PublicSessionView> {
  const r = await fetch(
    `${API}/public/sessions/${encodeURIComponent(sessionId)}`,
  )
  if (!r.ok) throw new Error(`public session: ${r.status}`)
  return r.json()
}

export type FeedbackOptionLabels = {
  was_there: string
  work_done: string
  dispute: string
}

export async function fetchFeedbackOptionLabels(
  sessionId: string,
  target: 'all' | number,
): Promise<FeedbackOptionLabels> {
  const t = target === 'all' ? 'all' : String(target)
  const r = await fetch(
    `${API}/public/sessions/${encodeURIComponent(sessionId)}/feedback-options?target=${encodeURIComponent(t)}`,
  )
  if (!r.ok) throw new Error(`feedback-options: ${r.status}`)
  const data = (await r.json()) as { labels: FeedbackOptionLabels }
  return data.labels
}

export async function fetchCities(): Promise<{ cities: string[]; regions: string[]; orgs: string[] }> {
  const r = await fetch(`${API}/public/cities`)
  if (!r.ok) throw new Error(`cities: ${r.status}`)
  return r.json()
}

export async function fetchStats(): Promise<PlatformStats> {
  const r = await fetch(`${API}/public/stats`)
  if (!r.ok) throw new Error(`stats: ${r.status}`)
  return r.json()
}

async function errorBodyMessage(r: Response, fallback: string): Promise<string> {
  const t = await r.text()
  try {
    const j = JSON.parse(t) as { detail?: unknown }
    if (typeof j.detail === 'string') return j.detail
  } catch {
    /* not json */
  }
  return t || fallback
}

export async function addPublicObservation(
  sessionId: string,
  body: {
    observation_type: 'was_there' | 'work_done' | 'dispute'
    commitment_index: number | null
    note?: string | null
    photo?: File | null
    website?: string
    humanVoice: Blob
    humanVoiceFileName?: string
  },
): Promise<Record<string, unknown>> {
  const fd = new FormData()
  fd.append('observation_type', body.observation_type)
  if (body.commitment_index != null) {
    fd.append('commitment_index', String(body.commitment_index))
  }
  if (body.note != null && body.note !== '') {
    fd.append('note', body.note)
  }
  if (body.photo) {
    fd.append('photo', body.photo, body.photo.name)
  }
  fd.append('website', body.website ?? '')
  fd.append(
    'human_voice',
    body.humanVoice,
    body.humanVoiceFileName ?? 'voice.webm',
  )
  const headers: Record<string, string> = {}
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  const r = await fetch(
    `${API}/public/sessions/${encodeURIComponent(sessionId)}/observations`,
    { method: 'POST', body: fd, headers },
  )
  if (!r.ok) {
    throw new Error(
      await errorBodyMessage(r, `Request failed (${r.status})`),
    )
  }
  return r.json()
}

export async function getRegistrySession(
  sessionId: string,
): Promise<RegistrySessionDoc> {
  const r = await fetch(
    `${API}/registry/sessions/${encodeURIComponent(sessionId)}`,
    { headers: authHeaders() },
  )
  if (!r.ok) throw new Error(`session: ${r.status}`)
  return r.json()
}

export async function setCommitmentStatus(
  sessionId: string,
  index: number,
  status: 'fulfilled' | 'pending',
): Promise<{ fulfillment_status: string; fulfilled_at?: string; fulfilled_by?: string }> {
  const r = await fetch(
    `${API}/registry/sessions/${encodeURIComponent(sessionId)}/commitments/${index}/status`,
    {
      method: 'PATCH',
      headers: jsonAuth(),
      body: JSON.stringify({ status }),
    },
  )
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || `commitmentStatus: ${r.status}`)
  }
  return r.json()
}

export type DashboardOrgRow = {
  org: string
  city?: string | null
  sessions: number
  commitments: number
  fulfilled: number
  overdue: number
  observations: number
  fulfillment_pct: number
  overdue_pct: number
}

export type DashboardOverdueItem = {
  session_id: string
  session_title: string
  org: string
  index: number
  description: string
  deadline?: string | null
  responsible?: string | null
}

export type AdminDashboard = {
  totals: {
    sessions: number
    published: number
    commitments: number
    fulfilled: number
    overdue: number
    observations: number
    akims: number
    operators?: number
    citizens?: number
  }
  orgs: DashboardOrgRow[]
  overdue_items: DashboardOverdueItem[]
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  const r = await fetch(`${API}/admin/dashboard`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`dashboard: ${r.status}`)
  return r.json()
}

export async function fetchOrgRatings(filters?: PublicFilters): Promise<OrgRating[]> {
  const params = new URLSearchParams()
  if (filters?.city) params.set('city', filters.city)
  if (filters?.region) params.set('region', filters.region)
  if (filters?.org) params.set('org', filters.org)
  if (filters?.search) params.set('search', filters.search)
  const qs = params.toString()
  const r = await fetch(`${API}/public/ratings${qs ? `?${qs}` : ''}`)
  if (!r.ok) throw new Error(`ratings: ${r.status}`)
  const data = (await r.json()) as { ratings: OrgRating[] }
  return data.ratings
}

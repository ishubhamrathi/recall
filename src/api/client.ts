const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8080'

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    usp.set(k, String(v))
  })
  return usp.toString()
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Endpoints the server marks CSRF-exempt (SecurityConfig `ignoringRequestMatchers`). They are
 * reached before — or immediately after — a session exists, so there may be no XSRF-TOKEN cookie
 * to read. Sending the header anyway is harmless but misleading: it hides the fact that these
 * calls are the one place a missing token is expected.
 */
const CSRF_EXEMPT_PATHS = /^\/api\/auth\/(login|register|logout|google|otp\/request|otp\/verify)(?:[?#]|$)/

/**
 * Paths where a 401 means "those credentials/code were wrong", not "your session expired".
 * Dispatching `auth:unauthorized` for these would bounce the user off the very form they are
 * filling in. `/me` is deliberately absent — a 401 there is exactly the expiry signal.
 *
 * `google/config` is a public read of deployment config, not a session probe: until the
 * backend ships it, the default-deny chain answers 401, and treating that as an expired
 * session would fire a bogus logout the moment the sign-in page asked for the client id.
 */
const AUTH_ENTRY_PATHS = /^\/api\/auth\/(login|register|otp\/verify|google|google\/config)(?:[?#]|$)/

/** Reads the non-HttpOnly CSRF cookie. Undefined when the cookie was dropped (e.g. over plain HTTP). */
export function getXsrfToken(): string | undefined {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : undefined
}

async function requestOnce<T>(path: string, init: RequestInit & { errorContext?: string } = {}): Promise<T> {
  const { errorContext, ...fetchInit } = init as any
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const method = (fetchInit.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchInit.headers as Record<string, string> | undefined),
  }
  // X-API-Key for PROJECT clients — runtime only (localStorage), never baked via VITE_ prefix.
  // Do NOT put secrets in VITE_ env (Vite inlines VITE_ vars into the browser bundle and they are public).
  // If you need a key locally, set it via: localStorage.setItem('recall_api_key', '<key>') in browser console.
  const apiKey = localStorage.getItem('recall_api_key') || undefined
  if (apiKey) headers['X-API-Key'] = apiKey

  // XSRF-TOKEN is required on every write. The sign-in endpoints are CSRF-exempt server-side
  // (SecurityConfig), so a missing token there is expected and must not block the request.
  const csrfExempt = CSRF_EXEMPT_PATHS.test(path)
  if (UNSAFE.has(method) && !csrfExempt) {
    const token = getXsrfToken()
    if (token) headers['X-XSRF-TOKEN'] = token
  }

  let res: Response
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...fetchInit,
      headers,
    })
  } catch (e: any) {
    // do not expose internal URL/BASE to UI - log it, show generic message
    console.error(`[api] network error ${errorContext || url}`, e)
    const err: any = new Error('Service temporarily unavailable. Please try again.')
    err.cause = e
    err.isNetworkError = true
    if (errorContext) err.context = errorContext
    throw err
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`
    const err: any = new Error(msg)
    err.status = res.status
    err.data = data
    // A missing/expired session, not a permissions problem. /login and /register return
    // 401 for wrong credentials, so they are excluded or we'd kick users off the sign-in
    // form they are currently using. Callers do not retry — the app re-renders sign-in.
    if (res.status === 401 && !AUTH_ENTRY_PATHS.test(path)) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
    }
    throw err
  }
  return data as T
}

/**
 * Drop-in wrapper: retries a write exactly once when the server rejects the CSRF token.
 * The session rotation is what makes this safe — a token minted for a previous session is
 * stale, and re-reading the cookie picks up the refreshed one. A second failure means the
 * cookie is being blocked entirely (usually plain HTTP on a non-localhost host).
 */
async function requestWithCsrfRetry<T>(path: string, init: RequestInit & { errorContext?: string } = {}): Promise<T> {
  try {
    return await requestOnce<T>(path, init)
  } catch (err: any) {
    const isCsrfFailure = err?.status === 403 && err?.data?.error === 'Invalid CSRF token'
    const method = (init.method ?? 'GET').toUpperCase()
    if (!isCsrfFailure || !UNSAFE.has(method)) throw err

    const fresh = getXsrfToken()
    if (!fresh) throw err
    return requestOnce<T>(path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), 'X-XSRF-TOKEN': fresh },
    })
  }
}

/** Every API call goes through here, so the CSRF retry applies app-wide. */
const request = requestWithCsrfRetry

// recallApi per contract §5
export type EnrichSource = {
  title: string
  url: string
  publisher?: string
  snippet?: string
}

export type EnrichResponse = {
  /** markdown, 2–4 sentences, the direct answer */
  answer: string
  /** markdown, one concrete worked example (may include a fenced code block) */
  example: string
  /** markdown, optional extra reading */
  deepDive?: string
  /** numbered citations; the card renders them as a numbered list */
  sources?: EnrichSource[]
  /** definitions/abbreviations for this question, `{ term, definition }` */
  terms?: { term: string; definition: string }[]
  /** short provider/model token, e.g. `gemini-2.5-flash` — never a prompt id */
  model?: string
  generatedAt?: string
  cached?: boolean
}

export const recallApi = {
  questions: (params: Record<string, any> = {}) => {
    const q = qs(params)
    return request<{ data: any[]; page: number; size: number; total: number; totalPages: number }>(`/api/recall/questions${q ? `?${q}` : ''}`)
  },
  question: (id: string) => request<any>(`/api/recall/questions/${id}`),
  createQuestion: (body: Record<string, any>) => request<any>('/api/recall/questions', { method: 'POST', body: JSON.stringify(body) }),
  updateQuestion: (id: string, body: Record<string, any>) => request<any>(`/api/recall/questions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteQuestion: (id: string) => request<void>(`/api/recall/questions/${id}`, { method: 'DELETE' }),

  reviews: {
    create: (body: { questionId: string; action: 'know' | 'practice' | 'bookmark'; revealedAt?: string; durationMs?: number; confidenceDelta?: number }) =>
      request<any>('/api/recall/reviews', { method: 'POST', body: JSON.stringify(body) }),
    list: (questionId?: string) => request<{ data: any[] }>(`/api/recall/reviews${questionId ? `?questionId=${questionId}` : ''}`),
    stats: (questionId?: string) => request<any>(`/api/recall/reviews/stats${questionId ? `?questionId=${questionId}` : ''}`),
  },

  bookmarks: {
    list: (params: Record<string, any> = {}) => {
      const q = qs(params)
      return request<{ data: any[]; page: number; size: number; total: number }>(`/api/recall/bookmarks${q ? `?${q}` : ''}`)
    },
    create: (questionId: string) => request<any>('/api/recall/bookmarks', { method: 'POST', body: JSON.stringify({ questionId }) }),
    remove: (questionId: string) => request<void>(`/api/recall/bookmarks/${questionId}`, { method: 'DELETE' }),
  },

  search: (q: string, params: Record<string, any> = {}) => {
    const extra = qs({ ...params, limit: params.limit ?? 20 })
    return request<{ data: any[]; total: number }>(`/api/recall/search?q=${encodeURIComponent(q)}${extra ? `&${extra}` : ''}`)
  },

  progress: () => request<{ streak: number; longestStreak: number; totalReviews: number; mastered: number; familiar: number; learning: number; new: number; byTopic: any[]; weekly: any[]; heatmap: any[] }>('/api/recall/progress'),
  streakDays: (days = 84) => request<{ data: { day: string; reviewsCount: number }[]; streak: number; longestStreak: number }>(`/api/recall/streak-days?days=${days}`),
  topics: () => request<{ name: string; count: number; color: string }[] | { data: any[] }>('/api/recall/topics'),
  topicBundles: () => request<{ id?: string; slug: string; name: string; description: string; topics: string[]; color: string; icon?: string; count?: number }[] | { data: any[] }>('/api/recall/topic-bundles'),
  // Enrichment payload — see docs/BACKEND_REQUIREMENTS_ENRICH_V2.md.
  // `answer`/`example`/`deepDive` are markdown; `sources` is Perplexity-style
  // citations; `terms` carries definitions the card renders as a list.
  enrich: (body: { question: string; topic?: string; difficulty?: string }) => request<EnrichResponse>('/api/recall/enrich', { method: 'POST', body: JSON.stringify(body), errorContext: 'enrich' } as any),
  enrichById: (id: string, persist = false) => request<EnrichResponse & { persisted?: boolean }>(`/api/recall/questions/${id}/enrich?persist=${persist}`, { method: 'POST', errorContext: 'enrichById' } as any),
  enrichSearch: (q: string) => request<{ AbstractText?: string; AbstractURL?: string; RelatedTopics?: { Text: string }[] }>(`/api/recall/enrich/search?q=${encodeURIComponent(q)}`, { errorContext: 'enrichSearch' } as any),
  sessions: {
    create: () => request<any>('/api/recall/sessions', { method: 'POST' }),
    update: (id: string, body: Record<string, any>) => request<any>(`/api/recall/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  auth: {
    // 1) Spec: AuthController.java:20 POST /api/auth/register 201 {id,email,name,role,level,metadata} 400/409
    // RegisterRequest.java:7 password >=8
    me: (includeRecall = true) => request<{ id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown>; streakCount?: number; totalReviews?: number }>(includeRecall ? '/api/auth/me?include=recall' : '/api/auth/me'),
    login: (body: { email: string; password: string }) => request<{ id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown> }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body), errorContext: 'auth-login' } as any),
    register: (body: { email: string; password: string; name: string }) => request<{ id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown> }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body), errorContext: 'auth-register' } as any),
    logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
    // Email verification code. The deployed backend requires an existing session on both
    // endpoints and a `channel` discriminator ('email' | 'sms'); `phone` is required for sms.
    // These are therefore post-signup verification, NOT a passwordless sign-in.
    otpRequest: (body: { email: string; channel?: 'email' | 'sms'; phone?: string }) =>
      request<{ message: string }>('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ channel: 'email', ...body }), errorContext: 'auth-otp-request' } as any),
    otpVerify: (body: { email: string; code: string; channel?: 'email' | 'sms'; phone?: string }) =>
      request<{ verified?: boolean; message?: string }>('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ channel: 'email', ...body }), errorContext: 'auth-otp-verify' } as any),
    // Google sign-in, credential flow: post the ID token Google Identity Services handed the
    // browser and receive the same SESSION cookie every other method sets. CSRF-exempt.
    // `hd` (hosted-domain hint) and `inviteCode` are optional and the UI never sends them: `hd`
    // can only narrow the server's allowlist, so passing one risks locking out a legitimate user
    // for no benefit, and `inviteCode` is only consulted when the deployment configures
    // GOOGLE_INVITE_CODES (it does not).
    // 400 Validation failed | 400 Invalid Google credential | 403 Account link required
    // 403 Email not allowed | 503 Google sign-in is not configured. Never 409, never 429.
    google: (body: { credential: string; hd?: string; inviteCode?: string }) =>
      request<{ id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown>; phone?: string; emailVerified: boolean; phoneVerified: boolean }>('/api/auth/google', { method: 'POST', body: JSON.stringify(body), errorContext: 'auth-google' } as any),
    // The audience the server pins tokens to, read back from the deployment that will verify
    // them. The browser needs a client id to initialize Google Identity Services at all, and a
    // copy in .env drifts the moment GOOGLE_CLIENT_ID changes server-side — hence the server is
    // the source of truth and VITE_GOOGLE_CLIENT_ID is only a local override.
    // GET, so no X-XSRF-TOKEN; public, so no session is required.
    googleConfig: () =>
      request<{ configured: boolean; clientId: string }>('/api/auth/google/config', { errorContext: 'auth-google-config' } as any),
    // 5) Spec: UserProfileController.java:5 + UserDaoImpl.java:97 - users.metadata JSONB V72, users.level indexed
    updateProfile: (body: { name?: string; level?: string; metadata?: Record<string, unknown> }) => request<{ id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown> }>('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
    patchMetadata: (metadata: Record<string, unknown>) => request<{ level: string; metadata: Record<string, unknown> }>('/api/auth/metadata', { method: 'PATCH', body: JSON.stringify(metadata) }),
    patchLevel: (level: string) => request<{ level: string; metadata: Record<string, unknown> }>('/api/auth/level', { method: 'PATCH', body: JSON.stringify({ level }) }),
    // Set password after OTP sign-in
    setPassword: (newPassword: string) => request<{ message: string }>('/api/auth/password', { method: 'POST', body: JSON.stringify({ newPassword }), errorContext: 'auth-set-password' } as any),
  },
}

export const api = { request, qs }
export const authApi = recallApi.auth
// compat stub frontend/src/context/AuthContext.tsx:31 + api/client.ts:340
export const hasAccess = () => true

export { request, qs }
export default recallApi

const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8080'

function qs(params: Record<string, any>): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    usp.set(k, String(v))
  })
  return usp.toString()
}

async function request<T>(path: string, init: RequestInit & { errorContext?: string } = {}): Promise<T> {
  const { errorContext, ...fetchInit } = init as any
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchInit.headers as Record<string, string> | undefined),
  }
  // X-API-Key for PROJECT clients — runtime only (localStorage), never baked via VITE_ prefix.
  // Do NOT put secrets in VITE_ env (Vite inlines VITE_ vars into the browser bundle and they are public).
  // If you need a key locally, set it via: localStorage.setItem('recall_api_key', '<key>') in browser console.
  const apiKey = localStorage.getItem('recall_api_key') || undefined
  if (apiKey) headers['X-API-Key'] = apiKey

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
    throw err
  }
  return data as T
}

// recallApi per contract §5
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
  enrich: (body: { question: string; topic?: string; difficulty?: string }) => request<{ question: string; topic?: string; difficulty?: string; answer: string; explanation: string; source: string; sources?: string[]; generatedAt: string }>('/api/recall/enrich', { method: 'POST', body: JSON.stringify(body), errorContext: 'enrich' } as any),
  enrichById: (id: string, persist = false) => request<{ question: string; topic?: string; difficulty?: string; answer: string; explanation: string; source: string; persisted?: boolean }>(`/api/recall/questions/${id}/enrich?persist=${persist}`, { method: 'POST', errorContext: 'enrichById' } as any),
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
    // 5) Spec: UserProfileController.java:5 + UserDaoImpl.java:97 - users.metadata JSONB V72, users.level indexed
    updateProfile: (body: { name?: string; level?: string; metadata?: Record<string, unknown> }) => request<{ id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown> }>('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
    patchMetadata: (metadata: Record<string, unknown>) => request<{ level: string; metadata: Record<string, unknown> }>('/api/auth/metadata', { method: 'PATCH', body: JSON.stringify(metadata) }),
    patchLevel: (level: string) => request<{ level: string; metadata: Record<string, unknown> }>('/api/auth/level', { method: 'PATCH', body: JSON.stringify({ level }) }),
  },
}

export const api = { request, qs }
export const authApi = recallApi.auth
// compat stub frontend/src/context/AuthContext.tsx:31 + api/client.ts:340
export const hasAccess = () => true

export { request, qs }
export default recallApi

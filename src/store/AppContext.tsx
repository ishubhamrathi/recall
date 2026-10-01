import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Question, Topic } from '@/data/mockData'
import { TOPIC_COLORS } from '@/data/mockData'
import { recallApi } from '@/api/client'

function cleanQuestionText(s: string): string {
  if (!s) return s
  let t = s.trim()
  // strip trailing " (123)" bug from seeding / numbering
  t = t.replace(/\s*\(\d+\)\s*$/, '').trim()
  // fix missing space "useRAG" -> "use RAG" (case-insensitive)
  t = t.replace(/use\s*RAG/gi, 'use RAG')
  // normalize multiple spaces
  t = t.replace(/\s{2,}/g, ' ')
  return t
}

function normalizeQuestion(raw: any): Question {
  return {
    id: String(raw.id),
    topic: raw.topic,
    difficulty: raw.difficulty,
    question: cleanQuestionText(raw.question),
    answer: raw.answer,
    explanation: raw.explanation,
    interviewNotes: raw.interviewNotes ?? raw.interview_notes ?? '',
    followUps: raw.followUps ?? raw.follow_ups ?? [],
    tags: raw.tags ?? [],
    confidenceScore: raw.confidenceScore ?? raw.confidence_score ?? 40,
    reviewCount: raw.reviewCount ?? raw.review_count ?? 0,
    bookmarked: raw.bookmarked ?? false,
  }
}

function dedupeQuestions(list: Question[]): Question[] {
  const seenText = new Set<string>()
  const seenId = new Set<string>()
  const out: Question[] = []
  for (const q of list) {
    if (seenId.has(q.id)) continue
    const key = q.question.trim().toLowerCase()
    if (seenText.has(key)) continue
    seenText.add(key)
    seenId.add(q.id)
    out.push(q)
  }
  if (out.length !== list.length) console.warn(`[recall] deduped ${list.length - out.length} duplicate questions (e.g. RAG vs fine tuning)`)
  return out
}

function isTopic(value: unknown): value is Topic {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TOPIC_COLORS, value)
}

function normalizeTopicList(value: unknown): Topic[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter(isTopic)))
}

export type User = { id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown>; streakCount?: number; totalReviews?: number; avatarUrl?: string }

type AppState = {
  questions: Question[]
  setQuestions: (q: Question[]) => void
  toggleBookmark: (id: string) => void
  updateConfidence: (id: string, delta: number, meta?: { revealedAt?: string; durationMs?: number }) => void
  search: string
  setSearch: (s: string) => void
  selectedTopic: Topic | 'All'
  setSelectedTopic: (t: Topic | 'All') => void
  selectedTopics: Topic[]
  setSelectedTopics: (t: Topic[]) => void
  selectedBundle: string | null
  setSelectedBundle: (s: string | null) => void
  streak: number
  showToast: (msg: string) => void
  toast: string | null
  loading: boolean
  questionsError: string | null
  user: User | null
  authReady: boolean
  login: (email: string, password: string) => Promise<User>
  register: (email: string, password: string, name: string) => Promise<User>
  signOut: () => Promise<void>
  logout: () => Promise<void>
  /**
   * Exchange a Google ID token for a session, then adopt the returned user. Google sign-in
   * mints the same SESSION cookie as password/OTP, so from here on there is no distinction
   * between sign-in methods. Rejects with a GoogleAuthError the caller can branch on.
   */
  signInWithGoogle: (credential: string) => Promise<User>
  /** Send a 6-digit code to the authenticated user's email to confirm the address. */
  requestOtp: (email: string) => Promise<{ message: string }>
  /** Verify that 6-digit code. Refetches /me so verified state is reflected in the UI. */
  verifyOtp: (email: string, code: string) => Promise<User>
  updateProfile: (body: { name?: string; level?: string; metadata?: Record<string, unknown> }) => Promise<User>
  patchMetadata: (metadata: Record<string, unknown>) => Promise<User>
  patchLevel: (level: string) => Promise<User>
  hasAccess: () => boolean
  notes: Record<string, string>
  saveNote: (questionId: string, text: string) => void
  deleteNote: (questionId: string) => void
}

const Ctx = createContext<AppState | null>(null)

const AUTH_TIMEOUT_MS = 8000
const QUESTIONS_TIMEOUT_MS = 15000

// Single-flight session bootstrap. StrictMode double-invokes effects: a plain ref guard
// (`didAuthInit`) would let the simulated unmount cancel the only in-flight request while
// blocking the retry, stranding authReady=false and pinning every guard on "Checking your
// session…". Sharing the request at module level keeps it to one call AND lets the second
// effect run apply the result.
let authBootstrap: Promise<{ user: User | null; streak: number }> | null = null
// Set once login()/register() establishes a session. A slow bootstrap that resolves
// afterwards captured the anonymous state, and would otherwise clobber the new user
// back to null — bouncing them straight back out of the app they just signed into.
let sessionEstablished = false

function bootstrapAuth(): Promise<{ user: User | null; streak: number }> {
  if (!authBootstrap) {
    authBootstrap = (async () => {
      let u: any = null
      let streak = 0
      // The SESSION cookie is the only credential — /me is the single source of truth
      // for "am I signed in", for every sign-in method (password, OTP, Google).
      try {
        u = await recallApi.auth.me(true)
      } catch { /* no valid session */ }
      try {
        const p = await recallApi.progress()
        if (typeof p?.streak === 'number') streak = p.streak
      } catch { /* progress is auth-only; a signed-in user without it is still signed in */ }
      return { user: u, streak }
    })().catch(() => ({ user: null, streak: 0 }))
  }
  return authBootstrap
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [search, setSearch] = useState('')
  const [selectedTopic, setSelectedTopic] = useState<Topic | 'All'>(() => {
    try { const v = localStorage.getItem('recall_selectedTopic'); return isTopic(v) ? v : 'All' } catch { return 'All' }
  })
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(() => {
    try {
      const raw = localStorage.getItem('recall_selectedTopics')
      if (raw) return normalizeTopicList(JSON.parse(raw))
      const single = localStorage.getItem('recall_selectedTopic')
      return single && single !== 'All' && isTopic(single) ? [single] : []
    } catch { return [] }
  })
  const [selectedBundle, setSelectedBundle] = useState<string | null>(() => {
    try { return localStorage.getItem('recall_selectedBundle') || null } catch { return null }
  })
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [questionsError, setQuestionsError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [streak, setStreak] = useState(0)
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('recall_notes') || '{}') } catch { return {} }
  })

  const questionTopics = selectedTopics.join(',')
  // `user` is a fresh object on every setUser (login re-fetches /me), so depend on the
  // primitive id — keying the effect off the object refetched and cancelled on each login.
  const userId = user?.id ?? null
  const questionsRun = useRef(0)

  useEffect(() => {
    let cancelled = false
    // never strand the guard: latch authReady even if the session call hangs
    const timeout = setTimeout(() => { if (!cancelled) setAuthReady(true) }, AUTH_TIMEOUT_MS)
    bootstrapAuth().then(({ user: u, streak: s }) => {
      if (cancelled) return
      // never demote a session that login()/register() already established
      if (!sessionEstablished) setUser(u)
      if (s) setStreak(s)
      setAuthReady(true)
    })
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [])

  // Global 401 handler. Any API call that finds no valid session dispatches
  // 'auth:unauthorized'; we drop local state so RequireAuth routes redirect to /login.
  // Do NOT retry the request — the session is gone, not the call.
  useEffect(() => {
    const onUnauthorized = () => {
      sessionEstablished = false
      authBootstrap = null
      setUser(null)
    }
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    // every feature route is sign-in gated, so don't fetch (or 401) while signed out
    if (!authReady) return
    if (!userId) {
      setQuestions([])
      setLoading(false)
      return
    }
    // A run token, not a per-run `cancelled` flag: whichever run is newest owns `loading`.
    // With a flag, a fetch superseded by a newer one was discarded without ever clearing
    // `loading`, which pinned Learn on "Loading questions…".
    const run = ++questionsRun.current
    const isStale = () => run !== questionsRun.current
    setLoading(true)
    setQuestionsError(null)
    // a hung request must not strand the spinner either
    const timeout = setTimeout(() => {
      if (isStale()) return
      setQuestions([])
      setQuestionsError('Loading questions took too long. Please retry.')
      setLoading(false)
    }, QUESTIONS_TIMEOUT_MS)
    recallApi.questions({
      status: 'approved',
      size: 100,
      sort: 'created_at.desc',
      ...(questionTopics ? { topics: questionTopics } : {}),
      ...(questionTopics || selectedBundle ? { mix: 'recall' } : {}),
    })
      .then(res => {
        if (isStale()) return
        const list = (res as any).data ?? (res as any)
        const mapped = Array.isArray(list) ? list.map(normalizeQuestion) : []
        setQuestions(dedupeQuestions(mapped))
        setQuestionsError(null)
      })
      .catch((err: any) => {
        if (isStale()) return
        setQuestions([])
        setQuestionsError(err?.isNetworkError ? 'Unable to load questions right now.' : 'Unable to load questions for this selection.')
      })
      .finally(() => {
        clearTimeout(timeout)
        if (!isStale()) setLoading(false)
      })
    return () => { clearTimeout(timeout) }
  }, [questionTopics, selectedBundle, authReady, userId])
  useEffect(() => { if (toast) { const t = setTimeout(()=>setToast(null), 2500); return ()=>clearTimeout(t)} }, [toast])
  useEffect(() => { try { localStorage.setItem('recall_selectedTopic', selectedTopic) } catch {} }, [selectedTopic])
  useEffect(() => { try { localStorage.setItem('recall_selectedTopics', JSON.stringify(selectedTopics)) } catch {} }, [selectedTopics])
  useEffect(() => { try { if (selectedBundle) localStorage.setItem('recall_selectedBundle', selectedBundle); else localStorage.removeItem('recall_selectedBundle') } catch {} }, [selectedBundle])

  // keep single ↔ multi in sync for backward compat
  useEffect(() => {
    if (selectedTopics.length === 0) setSelectedTopic('All')
    else if (selectedTopics.length === 1) setSelectedTopic(selectedTopics[0])
    else setSelectedTopic('All')
  }, [selectedTopics])

  // notes: persist to localStorage (per-user key if logged in, fallback to shared)
  const notesKey = user ? `recall_notes_${user.id}` : 'recall_notes'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(notesKey)
      if (raw) setNotes(JSON.parse(raw))
      else if (!user) {
        const shared = localStorage.getItem('recall_notes')
        if (shared) setNotes(JSON.parse(shared))
      } else setNotes({})
    } catch { setNotes({}) }
  }, [notesKey])
  useEffect(() => {
    try { localStorage.setItem(notesKey, JSON.stringify(notes)); if (!user) localStorage.setItem('recall_notes', JSON.stringify(notes)) } catch {}
  }, [notes, notesKey])

  const saveNote = (questionId: string, text: string) => {
    const t = text.trim()
    setNotes(prev => {
      if (!t) { const { [questionId]: _omit, ...rest } = prev; return rest }
      return { ...prev, [questionId]: t }
    })
  }
  const deleteNote = (questionId: string) => {
    setNotes(prev => { const { [questionId]: _omit, ...rest } = prev; return rest })
  }

  const toggleBookmark = (id: string) => {
    // optimistic local
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, bookmarked: !q.bookmarked } : q))
    const isNowBookmarked = !questions.find(q => q.id === id)?.bookmarked
    const call = isNowBookmarked ? recallApi.bookmarks.create(id) : recallApi.bookmarks.remove(id)
    call.catch((err: any) => {
      // revert on failure and tell the user, rather than silently losing the bookmark
      setQuestions(prev => prev.map(q => q.id === id ? { ...q, bookmarked: !q.bookmarked } : q))
      showToast(err?.status === 401 ? 'Session expired — sign in again' : 'Could not save bookmark')
    })
  }
  const updateConfidence = (id: string, delta: number, meta?: { revealedAt?: string; durationMs?: number }) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, confidenceScore: Math.max(0, Math.min(100, q.confidenceScore + delta)), reviewCount: q.reviewCount + 1 } : q))
    const action = delta > 0 ? 'know' as const : 'practice' as const
    recallApi.reviews.create({
      questionId: id,
      action,
      revealedAt: meta?.revealedAt,
      durationMs: meta?.durationMs,
    }).then(res => {
      if (res && typeof res.confidenceScore === 'number') {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, confidenceScore: res.confidenceScore, reviewCount: res.reviewCount ?? q.reviewCount } : q))
        if (typeof res.streak === 'number') setStreak(res.streak)
      }
    }).catch((err: any) => {
      // never drop a swipe silently — the optimistic score above is a lie until this lands
      setQuestions(prev => prev.map(q => q.id === id ? { ...q, confidenceScore: Math.max(0, Math.min(100, q.confidenceScore - delta)), reviewCount: Math.max(0, q.reviewCount - 1) } : q))
      showToast(err?.status === 401 ? 'Session expired — sign in again' : 'Could not save that swipe')
    })
  }
  const login = async (email: string, password: string) => {
    const u = await recallApi.auth.login({ email, password })
    sessionEstablished = true
    authBootstrap = null
    setUser(u as any)
    setAuthReady(true)
    recallApi.auth.me(true).then(mu => setUser(mu as any)).catch(()=>{})
    return u as any
  }
  const register = async (email: string, password: string, name: string) => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters')
    const u = await recallApi.auth.register({ email, password, name })
    sessionEstablished = true
    authBootstrap = null
    setUser(u as any)
    setAuthReady(true)
    return u as any
  }
  // Google already established the session server-side and handed us the user, so there is
  // nothing to re-read — but the guard on `sessionEstablished` still matters: an in-flight
  // bootstrap that resolves later captured the anonymous state and would demote this user.
  const signInWithGoogle = async (credential: string): Promise<User> => {
    const u = await recallApi.auth.google({ credential })
    sessionEstablished = true
    authBootstrap = null
    setUser(u as any)
    setAuthReady(true)
    return u as any
  }
  const requestOtp = async (email: string) => {
    return recallApi.auth.otpRequest({ email })
  }
  // Verification, not sign-in: the session was already established by register()/login(),
  // and the backend requires one to exist. Re-fetch /me so the UI reflects the new
  // verified state instead of leaving a stale user object in place.
  const verifyOtp = async (email: string, code: string): Promise<User> => {
    await recallApi.auth.otpVerify({ email, code })
    const fresh = await recallApi.auth.me(true).catch(() => null)
    if (fresh) setUser(fresh as User)
    return (fresh ?? user) as User
  }
  const setPassword = async (newPassword: string) => {
    return recallApi.auth.setPassword(newPassword)
  }
  const signOut = async () => {
    sessionEstablished = false
    authBootstrap = null
    // A 401 here (session already gone) still means signed out locally — clear state
    // regardless so the UI can never get stuck showing a user we no longer have.
    try { await recallApi.auth.logout() } finally { setUser(null) }
  }
  const logout = signOut
  // 5) Metadata / Level UserProfileController.java:5
  const updateProfile = async (body: { name?: string; level?: string; metadata?: Record<string, unknown> }) => {
    const u = await recallApi.auth.updateProfile(body)
    setUser((prev: any) => ({ ...(prev ?? {}), ...u } as any))
    return u as any
  }
  const patchMetadata = async (metadata: Record<string, unknown>) => {
    const r = await recallApi.auth.patchMetadata(metadata)
    setUser((prev: any) => prev ? ({ ...prev, metadata: r.metadata ?? metadata, level: (r as any).level ?? prev.level } as any) : prev)
    return r as any
  }
  const patchLevel = async (level: string) => {
    const r = await recallApi.auth.patchLevel(level)
    setUser((prev: any) => prev ? ({ ...prev, level: r.level, metadata: (r as any).metadata ?? prev.metadata } as any) : prev)
    return r as any
  }
  const hasAccess = () => true
  const showToast = (msg: string) => setToast(msg)

  const value = useMemo(() => ({ questions, setQuestions, toggleBookmark, updateConfidence, search, setSearch, selectedTopic, setSelectedTopic, selectedTopics, setSelectedTopics, selectedBundle, setSelectedBundle, streak, toast, showToast, loading, questionsError, user, authReady, login, register, signOut, logout, signInWithGoogle, requestOtp, verifyOtp, setPassword, updateProfile, patchMetadata, patchLevel, hasAccess, notes, saveNote, deleteNote }), [questions, search, selectedTopic, selectedTopics, selectedBundle, toast, loading, questionsError, user, authReady, streak, notes])
  return <Ctx.Provider value={value}>{children}
    {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass-strong px-5 py-3 rounded-full text-sm font-medium z-50 flex items-center gap-2 shadow-xl border border-white/10">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{toast}
    </div>}
  </Ctx.Provider>
}

export const useApp = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Question, Topic } from '@/data/mockData'
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

export type User = { id: string; email: string; name: string; role: string; level: string; metadata: Record<string, unknown>; streakCount?: number; totalReviews?: number }

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
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (email: string, password: string, name: string) => Promise<User>
  signOut: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (body: { name?: string; level?: string; metadata?: Record<string, unknown> }) => Promise<User>
  patchMetadata: (metadata: Record<string, unknown>) => Promise<User>
  patchLevel: (level: string) => Promise<User>
  hasAccess: () => boolean
  notes: Record<string, string>
  saveNote: (questionId: string, text: string) => void
  deleteNote: (questionId: string) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [search, setSearch] = useState('')
  const [selectedTopic, setSelectedTopic] = useState<Topic | 'All'>(() => {
    try { const v = localStorage.getItem('recall_selectedTopic') as Topic | 'All' | null; return (v as any) || 'All' } catch { return 'All' }
  })
  const [selectedTopics, setSelectedTopics] = useState<Topic[]>(() => {
    try { const raw = localStorage.getItem('recall_selectedTopics'); if (raw) return JSON.parse(raw); const single = localStorage.getItem('recall_selectedTopic'); if (single && single !== 'All') return [single as Topic]; return [] } catch { return [] }
  })
  const [selectedBundle, setSelectedBundle] = useState<string | null>(() => {
    try { return localStorage.getItem('recall_selectedBundle') || null } catch { return null }
  })
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [streak, setStreak] = useState(0)
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('recall_notes') || '{}') } catch { return {} }
  })

  useEffect(() => {
    let cancelled = false
    recallApi.auth.me(true).then(u => {
      if (!cancelled) setUser(u as any)
    }).catch(() => {})
    setLoading(true)
    recallApi.questions({ status: 'approved', size: 100, sort: 'created_at.desc' })
      .then(res => {
        if (cancelled) return
        const list = (res as any).data ?? (res as any)
        let mapped: Question[] = []
        if (Array.isArray(list) && list.length > 0) mapped = list.map(normalizeQuestion)
        else if (Array.isArray(res) && res.length > 0) mapped = (res as any).map(normalizeQuestion)
        setQuestions(dedupeQuestions(mapped))
      })
      .catch((err: any) => {
        if (!cancelled) {
          setQuestions([])
          // do not expose internal URL - client already shows generic "Service temporarily unavailable"
          const msg = err?.isNetworkError ? err.message : (err?.message || 'Failed to load questions')
          console.error('[recallApi.questions]', err)
          // only show non-network errors to user; network errors already generic
          if (!err?.isNetworkError) setToast(msg)
          else setToast('Service temporarily unavailable')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    recallApi.progress().then(p => { if (!cancelled && typeof p.streak === 'number') setStreak(p.streak) }).catch((e)=> console.warn('[recallApi.progress]', e))
    return () => { cancelled = true }
  }, [])
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
    call.catch(() => {
      // revert on failure (keeps local fallback)
      setQuestions(prev => prev.map(q => q.id === id ? { ...q, bookmarked: !q.bookmarked } : q))
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
    }).catch(() => {})
  }
  const login = async (email: string, password: string) => {
    const u = await recallApi.auth.login({ email, password })
    setUser(u as any)
    recallApi.auth.me(true).then(mu => setUser(mu as any)).catch(()=>{})
    return u as any
  }
  const register = async (email: string, password: string, name: string) => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters')
    const u = await recallApi.auth.register({ email, password, name })
    setUser(u as any)
    return u as any
  }
  const signOut = async () => {
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

  const value = useMemo(() => ({ questions, setQuestions, toggleBookmark, updateConfidence, search, setSearch, selectedTopic, setSelectedTopic, selectedTopics, setSelectedTopics, selectedBundle, setSelectedBundle, streak, toast, showToast, loading, user, login, register, signOut, logout, updateProfile, patchMetadata, patchLevel, hasAccess, notes, saveNote, deleteNote }), [questions, search, selectedTopic, selectedTopics, selectedBundle, toast, loading, user, streak, notes])
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

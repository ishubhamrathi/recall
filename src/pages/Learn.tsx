import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Eye, Bookmark, X, Check, RotateCcw, Sparkles, ChevronLeft } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useLocation } from 'react-router-dom'
import type { Question } from '@/data/mockData'
import { GlossaryText } from '@/components/ui/glossary-text'
import { recallApi } from '@/api/client'

function ConfidenceBar({ score }: { score: number }) {
  const level = score < 25 ? 'New' : score < 50 ? 'Learning' : score < 80 ? 'Familiar' : 'Mastered'
  const color = score < 25 ? 'bg-slate-500' : score < 50 ? 'bg-amber-500' : score < 80 ? 'bg-blue-500' : 'bg-emerald-500'
  return <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${color} transition-all`} style={{width:`${score}%`}} /></div>
    <span className="text-[11px] text-slate-400">{level} • {score}%</span>
  </div>
}

function AutoRevealButton({ title, revealed, onReveal }: { title: string; revealed: boolean; onReveal: () => void }) {
  // slower timing: base 2600ms + 30ms per char, clamp 3000-8000ms (was 1400+22, 1800-5200)
  const duration = Math.min(8000, Math.max(3000, 2600 + title.length * 30))
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const onRevealRef = useRef(onReveal)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(performance.now())
  const pausedTotalRef = useRef<number>(0)
  const pausedAtRef = useRef<number | null>(null)
  useEffect(() => { onRevealRef.current = onReveal }, [onReveal])

  useEffect(() => {
    if (revealed) {
      setProgress(100)
      setIsPaused(false)
      cancelAnimationFrame(rafRef.current)
      return
    }
    setProgress(0)
    setIsPaused(false)
    startRef.current = performance.now()
    pausedTotalRef.current = 0
    pausedAtRef.current = null

    const tick = (now: number) => {
      if (pausedAtRef.current !== null) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const elapsed = now - startRef.current - pausedTotalRef.current
      const p = Math.min(100, (elapsed / duration) * 100)
      setProgress(p)
      if (p >= 100) {
        onRevealRef.current()
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [title, duration, revealed])

  const pause = () => {
    if (revealed || pausedAtRef.current !== null) return
    pausedAtRef.current = performance.now()
    setIsPaused(true)
  }
  const resume = () => {
    if (pausedAtRef.current === null) return
    pausedTotalRef.current += performance.now() - pausedAtRef.current
    pausedAtRef.current = null
    setIsPaused(false)
  }

  if (revealed) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6, transition: { duration: 0.2 } }}
      className="mt-auto pt-6 relative w-full group select-none"
      onPointerDown={pause}
      onPointerUp={resume}
      onPointerLeave={resume}
      onPointerCancel={resume}
    >
      <div className="absolute inset-0 top-6 rounded-full bg-gradient-to-r from-blue-600/40 to-cyan-500/40 blur-[14px] opacity-60 group-hover:opacity-80 pointer-events-none" />
      <button
        onClick={onReveal}
        onPointerDown={(e) => e.preventDefault()}
        className="relative w-full py-[14px] rounded-full font-medium flex items-center justify-center gap-2 overflow-hidden bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.08] transition-colors"
      >
        {/* left-to-right fill */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-cyan-500 pointer-events-none"
          style={{ width: `${progress}%`, transition: isPaused ? 'none' : 'width 0.12s linear' }}
        />
        <span className="absolute inset-0 rounded-full border border-white/0 pointer-events-none" />
        <span className="relative flex items-center gap-2">
          <Eye className="w-4 h-4" /> Reveal Answer
        </span>
      </button>
    </motion.div>
  )
}

function GhostCard({ q, depth }: { q: Question; depth: number }) {
  const scale = depth === 1 ? 0.97 : 0.94
  const y = depth === 1 ? 10 : 18
  const opacity = depth === 1 ? 0.55 : 0.32
  const rotate = depth === 1 ? -0.6 : 0.6
  const blur = depth === 1 ? 'blur(0.6px)' : 'blur(1.6px)'
  return (
    <motion.div
      initial={{ y: y + 10, scale: scale * 0.97, opacity: 0 }}
      animate={{ y, scale, opacity, rotate: `${rotate}deg` }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className="absolute inset-0 rounded-[28px] glass-strong border border-white/[0.06] shadow-xl overflow-hidden pointer-events-none will-change-transform flex flex-col"
      style={{ filter: blur }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-600/10 blur-[50px] rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/5 blur-[50px] rounded-full" />
      </div>
      <div className="relative p-6 lg:p-7 flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-500 text-xs">{q.topic}</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-600 text-xs">{q.difficulty}</span>
          </div>
          <div className="w-9 h-9 rounded-full glass border border-white/10 opacity-50" />
        </div>
        <div className="mt-6 space-y-2.5">
          <div className="h-[22px] rounded-lg bg-white/10 w-[92%]" />
          <div className="h-[22px] rounded-lg bg-white/10 w-[78%]" />
          <div className="h-[22px] rounded-lg bg-white/10 w-[64%] opacity-60" />
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-5 w-16 rounded-full bg-white/5 border border-white/10" />
          <div className="h-5 w-20 rounded-full bg-white/5 border border-white/10" />
          <div className="h-5 w-12 rounded-full bg-white/5 border border-white/10" />
        </div>
        <div className="mt-auto pt-6">
          <div className="h-10 rounded-full bg-white/[0.04] border border-white/5" />
        </div>
        <div className="mt-6 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-white/10" style={{ width: '38%' }} /></div>
      </div>
    </motion.div>
  )
}

function QuestionCard({ q, revealed, onReveal, onBookmark, onSwipe, dir }: { q: Question; revealed:boolean; onReveal:()=>void; onBookmark:()=>void; onSwipe:(dir:'left'|'right'|'up')=>void; dir?: 'left'|'right'|'up'|null }) {
  const diffColor = q.difficulty==='Easy' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/15' : q.difficulty==='Medium' ? 'text-amber-300 border-amber-500/30 bg-amber-500/15' : 'text-red-300 border-red-500/30 bg-red-500/15'
  const { notes, saveNote, deleteNote, showToast } = useApp()
  const note = notes[q.id] || ''
  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(note)
  useEffect(() => { setDraftNote(note); if (!note) setEditingNote(false) }, [note, q.id])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<{ answer: string; explanation?: string; source?: string } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const handleAiEnrich = async () => {
    setAiLoading(true); setAiError(null)
    try {
      const res: any = await recallApi.enrich({ question: q.question, topic: q.topic, difficulty: q.difficulty }).catch(() => recallApi.enrichById(q.id, false))
      setAiResult(res)
    } catch (e: any) {
      const msg = e?.data?.error || e?.message || 'AI enrichment under maintenance — try again later'
      // expected to fail without keys, show small maintenance error
      setAiError(msg.includes('maintenance') ? msg : 'AI enrichment under maintenance — try again later')
    } finally { setAiLoading(false) }
  }
  useEffect(() => { setAiResult(null); setAiError(null); setAiLoading(false) }, [q.id])
  const dragX = useMotionValue(0)
  const dragRotate = useTransform(dragX, [-180, 180], [-14, 14])
  return (
    <motion.div
      drag
      dragConstraints={{left:0,right:0,top:0,bottom:0}}
      dragElastic={0.55}
      style={{ originX: 0.5, originY: 1, x: dragX, rotate: dragRotate }}
      onDrag={(_, info) => dragX.set(info.offset.x)}
      onDragEnd={(_, info: PanInfo) => {
        dragX.set(0)
        if (info.offset.x > 110) onSwipe('right')
        else if (info.offset.x < -110) onSwipe('left')
        else if (info.offset.y < -110) onSwipe('up')
      }}
      initial={{scale:0.96, opacity:0, y:16}}
      animate={{scale:1, opacity:1, y:0, x:0, rotate:0, transition:{type:'spring', stiffness:380, damping:28}}}
      exit={
        dir === 'left' ? { x: -560, y: 24, rotate: -18, opacity: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as any } } :
        dir === 'up' ? { y: -560, x: 0, rotate: 0, scale: 0.9, opacity: 0, transition: { duration: 0.32 } } :
        { x: 560, y: 24, rotate: 18, opacity: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as any } }
      }
      className="absolute inset-0 rounded-[28px] glass-strong border border-white/10 shadow-2xl overflow-hidden select-none flex flex-col min-h-[560px] will-change-transform"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-600/15 blur-[50px] rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 blur-[50px] rounded-full" />
      </div>
      <div className="relative p-6 lg:p-7 flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium">{q.topic}</span>
            <span className={`px-3 py-1 rounded-full border text-xs font-medium ${diffColor}`}>{q.difficulty}</span>
          </div>
          <button onClick={onBookmark} className={`w-9 h-9 rounded-full grid place-items-center border ${q.bookmarked ? 'bg-amber-500 text-white border-amber-500' : 'glass border-white/10 text-slate-400 hover:text-white'}`}>
            <Bookmark className={`w-4 h-4 ${q.bookmarked?'fill-white':''}`} />
          </button>
        </div>

        <h2 className="mt-6 text-[20px] lg:text-[22px] font-semibold leading-snug shrink-0">{q.question}</h2>

        <div className="mt-4 flex flex-wrap gap-2 shrink-0">
          {q.tags.map(t=><span key={t} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">#{t}</span>)}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {!revealed ? (
            <AutoRevealButton title={q.question} revealed={revealed} onReveal={onReveal} />
          ) : (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1,y:0}} className="mt-6 space-y-4 overflow-y-auto pr-1 -mr-1 custom-scrollbar max-h-[360px] lg:max-h-[380px]">
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Answer — explain to interviewer</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">“{q.answer}”</p>
                <p className="mt-2 text-[11px] text-slate-500">Say in 60–90s: what → why → how → trade-off. Keep it conversational.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleAiEnrich}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white disabled:opacity-50 hover:from-violet-500 hover:to-fuchsia-400 border border-white/10"
                  >
                    <Sparkles className="w-3 h-3" /> {aiLoading ? 'Generating…' : 'AI Answer'}
                  </button>
                  {aiError && <span className="text-[11px] text-amber-300">under maintenance</span>}
                </div>
                {aiError && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> AI enrichment under maintenance — try again later
                  </div>
                )}
                {aiResult && (
                  <div className="mt-3 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 p-3">
                    <div className="text-[11px] font-medium tracking-widest text-fuchsia-300 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3"/> AI Enriched {aiResult.source ? `• ${aiResult.source}` : ''}</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-fuchsia-100/90">{aiResult.answer}</p>
                    {aiResult.explanation && <p className="mt-1.5 text-xs leading-relaxed text-slate-300"><GlossaryText text={aiResult.explanation} /></p>}
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4">
                <div className="text-xs font-semibold tracking-widest text-blue-300 uppercase">Explanation — simple terms</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300"><GlossaryText text={q.explanation} /></p>
                <p className="mt-2 text-[11px] text-blue-200/70">Hover dotted words for full form / simple definition.</p>
              </div>
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
                <div className="text-xs font-semibold tracking-widest text-amber-300 uppercase flex items-center gap-2"><Sparkles className="w-3 h-3"/> Interview Notes</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300"><GlossaryText text={q.interviewNotes} /></p>
              </div>
              <div>
                <div className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Common Follow-ups</div>
                <ul className="mt-2 space-y-1.5">
                  {q.followUps.map(f=><li key={f} className="text-sm text-slate-400 flex gap-2"><span className="text-cyan-400">•</span>{f}</li>)}
                </ul>
              </div>
              <div className="rounded-2xl bg-violet-500/10 border border-violet-500/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold tracking-widest text-violet-300 uppercase flex items-center gap-2"><Sparkles className="w-3 h-3"/> My Note</div>
                  {note && !editingNote && (
                    <div className="flex gap-1">
                      <button onClick={() => { setDraftNote(note); setEditingNote(true) }} className="text-[11px] px-2 py-1 rounded-full bg-white/10 border border-white/10 hover:bg-white/15">Edit</button>
                      <button onClick={() => { deleteNote(q.id); showToast('Note removed') }} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-red-500/20 hover:text-red-300">Delete</button>
                    </div>
                  )}
                </div>
                {!editingNote ? (
                  note ? (
                    <p className="mt-2 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{note}</p>
                  ) : (
                    <button onClick={() => setEditingNote(true)} className="mt-2 w-full py-2 rounded-xl border border-dashed border-violet-500/30 bg-white/[0.02] text-xs text-violet-300 hover:bg-violet-500/10 hover:border-violet-500/40">+ Add personal note for later</button>
                  )
                ) : (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={draftNote}
                      onChange={e => setDraftNote(e.target.value)}
                      placeholder="Add your trick, shortcut, or reminder for later..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl bg-[#0B1020] border border-violet-500/30 outline-none text-sm placeholder:text-slate-500 focus:border-violet-500/50 resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingNote(false); setDraftNote(note) }} className="px-3 py-1.5 rounded-full text-xs border border-white/10 hover:bg-white/5">Cancel</button>
                      <button
                        onClick={() => {
                          if (!draftNote.trim()) { deleteNote(q.id); showToast('Note removed') }
                          else { saveNote(q.id, draftNote); showToast(note ? 'Note updated' : 'Note saved') }
                          setEditingNote(false)
                        }}
                        className="px-3 py-1.5 rounded-full text-xs bg-violet-600 text-white hover:bg-violet-500"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {!revealed && note && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-violet-300">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />Note saved
            </div>
          )}
        </div>

        <div className="mt-6 shrink-0"><ConfidenceBar score={q.confidenceScore} /></div>
      </div>
    </motion.div>
  )
}

function SwipeHintOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 pointer-events-none flex items-center justify-between px-1 sm:px-2"
      onClick={onDismiss}
    >
      {/* left blink */}
      <motion.button
        onClick={onDismiss}
        animate={{ opacity: [0.4, 1, 0.4], x: [-3, -7, -3] }}
        transition={{ duration: 1.1, repeat: Infinity }}
        className="pointer-events-auto flex items-center gap-1.5 bg-black/55 backdrop-blur rounded-full pl-1 pr-2.5 py-1.5 border border-white/10 shadow-lg"
      >
        <span className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 grid place-items-center text-cyan-300 text-sm">←</span>
        <span className="text-xs font-medium text-cyan-200 hidden sm:inline">Practice</span>
      </motion.button>

      {/* center hint */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-4 bg-black/60 backdrop-blur rounded-full px-3 py-1.5 border border-white/10 text-[11px] text-slate-200 flex items-center gap-1.5 cursor-pointer"
        onClick={onDismiss}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" /> Swipe
      </motion.div>

      {/* right blink */}
      <motion.button
        onClick={onDismiss}
        animate={{ opacity: [0.4, 1, 0.4], x: [3, 7, 3] }}
        transition={{ duration: 1.1, repeat: Infinity, delay: 0.55 }}
        className="pointer-events-auto flex items-center gap-1.5 bg-black/55 backdrop-blur rounded-full pr-1 pl-2.5 py-1.5 border border-white/10 shadow-lg"
      >
        <span className="text-xs font-medium text-emerald-200 hidden sm:inline">Know</span>
        <span className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 grid place-items-center text-emerald-300 text-sm">→</span>
      </motion.button>
    </motion.div>
  )
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
function buildRecallQueue(arr: Question[]): Question[] {
  const fresh = arr.filter(q => q.reviewCount === 0)
  const due = arr.filter(q => q.reviewCount > 0 && q.confidenceScore < 45)
  const learning = arr.filter(q => q.reviewCount > 0 && q.confidenceScore >= 45 && q.confidenceScore < 80)
  const mastered = arr.filter(q => q.confidenceScore >= 80)
  const sFresh = shuffle(fresh), sDue = shuffle(due), sLearning = shuffle(learning), sMastered = shuffle(mastered)
  const out: Question[] = []
  let iF=0,iD=0,iL=0,iM=0
  // round-robin: due > fresh > learning > mastered (40/30/20/10 feel)
  while (out.length < arr.length) {
    if (iD < sDue.length) out.push(sDue[iD++])
    if (out.length < arr.length && iF < sFresh.length) out.push(sFresh[iF++])
    if (out.length < arr.length && iL < sLearning.length) out.push(sLearning[iL++])
    if (out.length < arr.length && iM < sMastered.length) out.push(sMastered[iM++])
    if (iD>=sDue.length && iF>=sFresh.length && iL>=sLearning.length && iM>=sMastered.length) break
  }
  return out.length ? out : shuffle(arr)
}

export default function Learn() {
  const { questions, toggleBookmark, updateConfidence, showToast, selectedTopics } = useApp()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const isBundle = params.get('bundle') === 'recall' || params.get('mix') === 'recall' // support both
  const filteredBase = useMemo(()=> {
    if (!selectedTopics || selectedTopics.length===0) return questions
    return questions.filter(q=> selectedTopics.includes(q.topic as any))
  }, [questions, selectedTopics])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [filter, setFilter] = useState<'All'|'Easy'|'Medium'|'Hard'>('All')
  const [showHint, setShowHint] = useState(false)
  const [swipeDir, setSwipeDir] = useState<'left'|'right'|'up'|null>(null)
  const idleRef = useRef<number | null>(null)
  const difficultyFiltered = useMemo(()=> filter==='All' ? filteredBase : filteredBase.filter(q=>q.difficulty===filter), [filteredBase, filter])
  const list = useMemo(()=> {
    if (!isBundle) return difficultyFiltered
    // recall bundle: fresh + due interleaved, shuffled
    return buildRecallQueue(difficultyFiltered)
  }, [difficultyFiltered, isBundle])
  const q = list[idx % list.length]
  const next1 = list.length > 1 ? list[(idx + 1) % list.length] : null
  const next2 = list.length > 2 ? list[(idx + 2) % list.length] : null
  const shownAtRef = useRef<number>(Date.now())
  const revealedAtRef = useRef<string | null>(null)

  // slower normal reading, not skimming: ~155 wpm + comprehension buffer, clamped 4.8s–12s
  const getReadingDelayMs = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length
    const wpm = 155
    const base = (words / wpm) * 60000
    const withBuffer = base + 1800
    return Math.min(12000, Math.max(4800, Math.ceil(withBuffer)))
  }

  const resetIdle = () => {
    setShowHint(false)
    if (idleRef.current) window.clearTimeout(idleRef.current)
    const delay = q?.question ? getReadingDelayMs(q.question) : 6000
    idleRef.current = window.setTimeout(() => setShowHint(true), delay)
  }

  useEffect(()=>{ shownAtRef.current = Date.now(); revealedAtRef.current = null; resetIdle() }, [q?.id, idx])
  useEffect(()=>{ resetIdle(); return () => { if (idleRef.current) window.clearTimeout(idleRef.current) } }, [])
  useEffect(()=>{ setIdx(0); setRevealed(false) }, [isBundle, filteredBase.length])

  const handleReveal = () => {
    if (!revealed) revealedAtRef.current = new Date().toISOString()
    setRevealed(true)
    resetIdle()
  }

  // keyboard shortcuts
  useEffect(()=>{
    const h = (e: KeyboardEvent)=>{
      if(e.code==='Space'){ e.preventDefault(); if(!revealed) handleReveal(); else setRevealed(false)}
      if(e.code==='ArrowRight'){ handleSwipe('right')}
      if(e.code==='ArrowLeft'){ handleSwipe('left')}
      if(e.key==='b' || e.key==='B'){ if(q) toggleBookmark(q.id); showToast('Bookmarked')}
    }
    window.addEventListener('keydown', h)
    return ()=>window.removeEventListener('keydown', h)
  }, [q, revealed])

  const handleSwipe = (dir:'left'|'right'|'up')=>{
    if(!q) return
    resetIdle()
    if(dir==='up'){ toggleBookmark(q.id); showToast(q.bookmarked ? 'Removed bookmark' : 'Bookmarked'); return}
    const durationMs = Date.now() - shownAtRef.current
    const meta = { revealedAt: revealedAtRef.current ?? undefined, durationMs }
    if(dir==='right'){ updateConfidence(q.id, +18, meta); showToast('Marked as Known')}
    if(dir==='left'){ updateConfidence(q.id, -12, meta); showToast('Needs practice')}
    setSwipeDir(dir)
    setRevealed(false)
    // let card fly off with bottom pivot, then advance deck (magician endless)
    setTimeout(() => {
      setIdx(i=> (i+1) % list.length)
      setSwipeDir(null)
    }, 320)
  }

  if(!q) return <div className="text-center py-20 text-slate-400">No questions for this filter.</div>

  return (
    <div className="max-w-5xl mx-auto" onPointerMove={resetIdle} onTouchStart={resetIdle}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-3"><ChevronLeft className="w-5 h-5 text-slate-500"/> Learn</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1 rounded-full glass border border-white/10">{idx+1} / {list.length}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {['All','Easy','Medium','Hard'].map(d=>(
          <button key={d} onClick={()=>{setFilter(d as any); setIdx(0)}} className={`px-4 py-2 rounded-full text-sm border ${filter===d?'bg-white text-slate-900 border-white':'glass border-white/10 text-slate-400 hover:text-white'}`}>{d}</button>
        ))}
      </div>

      <div className="mt-8 relative min-h-[640px] flex flex-col items-center">
        <div className="relative w-full max-w-[560px] h-[560px]">
          {next2 && <GhostCard q={next2} depth={2} />}
          {next1 && <GhostCard q={next1} depth={1} />}
          <AnimatePresence mode="wait">
            <QuestionCard key={q.id + String(idx)} q={q} revealed={revealed} dir={swipeDir} onReveal={handleReveal} onBookmark={()=>{toggleBookmark(q.id); showToast(q.bookmarked?'Removed bookmark':'Bookmarked 🔖')}} onSwipe={handleSwipe} />
          </AnimatePresence>
          <AnimatePresence>
            {showHint && <SwipeHintOverlay onDismiss={resetIdle} />}
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={()=>handleSwipe('left')} className="w-14 h-14 rounded-full glass border border-white/10 grid place-items-center hover:bg-white/10 group">
            <X className="w-6 h-6 text-slate-400 group-hover:text-cyan-400" />
          </button>
          <button onClick={()=> revealed ? setRevealed(false) : handleReveal()} className="px-6 py-3 rounded-full glass border border-white/10 text-sm hover:bg-white/10"> {revealed?'Hide':'Reveal'} </button>
           <button onClick={()=>handleSwipe('right')} className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 grid place-items-center shadow-lg shadow-blue-500/20 hover:scale-105 transition-transform">
            <Check className="w-6 h-6 text-white" />
          </button>
          <button
            onClick={()=>handleSwipe('up')}
            aria-pressed={q.bookmarked}
            className={`w-14 h-14 rounded-full grid place-items-center border transition-colors ${q.bookmarked ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20' : 'glass border-white/10 text-slate-400 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/30'}`}
          >
            <Bookmark className={`w-5 h-5 ${q.bookmarked ? 'fill-white text-white' : ''}`} />
          </button>
        </div>
        <button onClick={()=>{setIdx(0); setRevealed(false); resetIdle()}} className="mt-4 text-xs text-slate-400 flex items-center gap-1 hover:text-white"><RotateCcw className="w-3 h-3"/> Restart deck</button>
      </div>
    </div>
  )
}

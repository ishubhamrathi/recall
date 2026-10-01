import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import type { Difficulty, Topic } from '@/data/mockData'
import { recallApi } from '@/api/client'

const DRAFT_KEY = 'recall_contribute_draft'
type ContributeForm = { topic: Topic; difficulty: Difficulty; question: string; answer: string; explanation: string; tags: string }
const EMPTY_FORM: ContributeForm = {topic:'Java', difficulty:'Medium', question:'', answer:'', explanation:'', tags:''}

export default function Contribute(){
  const { questions, setQuestions, showToast, user } = useApp()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [form, setForm] = useState<ContributeForm>(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      return raw ? { ...EMPTY_FORM, ...JSON.parse(raw) } : EMPTY_FORM
    } catch { return EMPTY_FORM }
  })
  const [submitting, setSubmitting] = useState(false)

  // survive a sign-in round trip (e.g. session expired mid-submit)
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch {}
  }, [form])

  const requireSignIn = () => {
    showToast('Please sign in to contribute')
    nav(`/login?from=${encodeURIComponent(pathname)}`, { replace: true })
  }

  const submit = async (e:React.FormEvent)=>{
    e.preventDefault()
    if (!user) return requireSignIn()
    if(!form.question || !form.answer) return showToast('Question & answer required')
    const payload = {
      topic: form.topic,
      difficulty: form.difficulty,
      question: form.question,
      answer: form.answer,
      explanation: form.explanation || 'User contributed',
      interviewNotes: 'Community contributed question.',
      followUps: ['Explain further'],
      tags: form.tags.split(',').map(s=>s.trim()).filter(Boolean),
      isCommunity: true,
    }
    setSubmitting(true)
    try {
      const created = await recallApi.createQuestion(payload)
      const norm = {
        id: String(created.id ?? `user-${Date.now()}`),
        topic: created.topic ?? payload.topic,
        difficulty: created.difficulty ?? payload.difficulty,
        question: created.question ?? payload.question,
        answer: created.answer ?? payload.answer,
        explanation: created.explanation ?? payload.explanation,
        interviewNotes: created.interviewNotes ?? created.interview_notes ?? payload.interviewNotes,
        followUps: created.followUps ?? created.follow_ups ?? payload.followUps,
        tags: created.tags ?? payload.tags,
        confidenceScore: 0, reviewCount: 0, bookmarked: false,
        status: created.status ?? 'pending',
      } as any
      setQuestions([...questions, norm])
      showToast(created.status === 'pending' ? 'Submitted for review' : 'Submitted')
      setForm(EMPTY_FORM)
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Failed to submit'
      if (err?.status === 401) return requireSignIn()
      showToast(msg)
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Contribute</h1>
      <p className="text-slate-400 text-sm">Share a question</p>
      <form onSubmit={submit} className="mt-6 rounded-2xl glass border border-white/10 p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-1.5"><span className="text-sm text-slate-300">Topic</span>
            <select value={form.topic} onChange={e=>setForm({...form, topic:e.target.value as Topic})} className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 outline-none">
              {['DSA','Java','Spring Boot','System Design','Networking','Operating System','Database','JavaScript','React','AI Engineering','DevOps'].map(t=><option key={t} className="bg-[#0F172A]">{t}</option>)}
            </select>
          </label>
          <label className="space-y-1.5"><span className="text-sm text-slate-300">Difficulty</span>
            <select value={form.difficulty} onChange={e=>setForm({...form, difficulty:e.target.value as Difficulty})} className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 outline-none">
              <option className="bg-[#0F172A]">Easy</option><option className="bg-[#0F172A]">Medium</option><option className="bg-[#0F172A]">Hard</option>
            </select>
          </label>
        </div>
        <label className="space-y-1.5 block"><span className="text-sm text-slate-300">Question</span>
          <textarea value={form.question} onChange={e=>setForm({...form, question:e.target.value})} rows={3} placeholder="e.g. What is the difference between..." className="w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 outline-none placeholder:text-slate-500" />
        </label>
        <label className="space-y-1.5 block"><span className="text-sm text-slate-300">Answer</span>
          <textarea value={form.answer} onChange={e=>setForm({...form, answer:e.target.value})} rows={4} placeholder="Concise, interview-ready answer..." className="w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 outline-none placeholder:text-slate-500" />
        </label>
        <label className="space-y-1.5 block"><span className="text-sm text-slate-300">Explanation (optional)</span>
          <textarea value={form.explanation} onChange={e=>setForm({...form, explanation:e.target.value})} rows={2} placeholder="Deeper context for the learner..." className="w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 outline-none placeholder:text-slate-500" />
        </label>
        <label className="space-y-1.5 block"><span className="text-sm text-slate-300">Tags (comma separated)</span>
          <input value={form.tags} onChange={e=>setForm({...form, tags:e.target.value})} placeholder="e.g. concurrency, collections" className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 outline-none placeholder:text-slate-500" />
        </label>
        <button type="submit" disabled={submitting} className="w-full py-3 rounded-full bg-white text-slate-900 text-sm font-medium disabled:opacity-60">{submitting ? 'Submitting…' : 'Submit'}</button>
      </form>
    </div>
  )
}

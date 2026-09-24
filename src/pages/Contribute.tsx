import { useState } from 'react'
import { useApp } from '@/store/AppContext'
import type { Difficulty, Topic } from '@/data/mockData'
import { recallApi } from '@/api/client'

export default function Contribute(){
  const { questions, setQuestions, showToast } = useApp()
  const [form, setForm] = useState({topic:'Java' as Topic, difficulty:'Medium' as Difficulty, question:'', answer:'', explanation:'', tags:''})
  const [submitting, setSubmitting] = useState(false)
  const submit = async (e:React.FormEvent)=>{
    e.preventDefault()
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
      setForm({topic:'Java', difficulty:'Medium', question:'', answer:'', explanation:'', tags:''})
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Failed to submit'
      if (err?.status === 401) showToast('Please sign in to contribute')
      else showToast(msg)
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

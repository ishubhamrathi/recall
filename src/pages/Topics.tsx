import { Link, useNavigate } from 'react-router-dom'
import { TOPIC_COLORS, TOPIC_BUNDLES } from '@/data/mockData'
import type { Topic } from '@/data/mockData'
import { useApp } from '@/store/AppContext'
import { useEffect, useState } from 'react'
import { recallApi } from '@/api/client'

type TopicRow = { name: Topic; count: number; color: string }
type BundleRow = { slug: string; name: string; description: string; topics: Topic[]; color: string; count?: number }

export default function Topics(){
  const { selectedTopics, setSelectedTopics, setSelectedBundle, setSelectedTopic } = useApp()
  const navigate = useNavigate()
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [bundles, setBundles] = useState<BundleRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    Promise.all([
      recallApi.topics().then((res:any)=>{
        const arr = Array.isArray(res) ? res : res?.data ?? []
        if (arr.length) setTopics(arr.map((t:any)=> ({ name: t.name as Topic, count: t.count, color: t.color || (TOPIC_COLORS as any)[t.name] || '#3B82F6' })))
      }).catch(()=>{}),
      recallApi.topicBundles().then((res:any)=>{
        const arr = Array.isArray(res) ? res : res?.data ?? []
        if (arr.length) setBundles(arr.map((b:any)=> ({ slug: b.slug, name: b.name, description: b.description || '', topics: (b.topics as Topic[]) || [], color: b.color || '#3B82F6', count: b.count })))
        else setBundles(TOPIC_BUNDLES as any)
      }).catch(()=> setBundles(TOPIC_BUNDLES as any))
    ]).finally(()=> setLoading(false))
  },[])

  const toggleTopic = (name: Topic) => {
    const next = selectedTopics.includes(name) ? selectedTopics.filter((t)=>t!==name) : [...selectedTopics, name]
    setSelectedTopics(next as Topic[])
    setSelectedBundle(null)
  }

  const startBundle = (b: BundleRow) => {
    setSelectedBundle(b.slug)
    setSelectedTopics(b.topics)
    setSelectedTopic('All')
    navigate('/learn?mix=recall')
  }

  const generateMix = () => {
    if (selectedTopics.length===0) return
    setSelectedBundle(null)
    navigate('/learn?mix=recall')
  }

  const clearSelection = () => {
    setSelectedTopics([])
    setSelectedBundle(null)
    setSelectedTopic('All')
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Topics</h1>
        <p className="text-slate-400 text-sm">Pick a bundle or mix multiple topics for spaced recall</p>
      </div>

      {/* Bundles — backend-driven, fallback to client */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pre-built Mixes</h2>
          <span className="text-xs text-slate-500">from backend • fallback local</span>
        </div>
        <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bundles.map(b=>(
            <div key={b.slug} className="rounded-2xl glass border border-white/10 p-6 flex flex-col">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-white text-sm font-bold" style={{background:b.color}}>{b.name.slice(0,2)}</div>
              <h3 className="mt-3 font-medium">{b.name}</h3>
              <p className="text-xs text-slate-400 mt-1">{b.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.topics.map(t=> <span key={t} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">{t}</span>)}
              </div>
              <button onClick={()=> startBundle(b)} className="mt-4 w-full py-2 rounded-full bg-white text-slate-900 text-sm font-medium text-center">Start Mix • {b.topics.length} topics</button>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-select */}
      <div className="rounded-2xl glass border border-white/10 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Mix Topics</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{selectedTopics.length} selected</span>
            {selectedTopics.length>0 && <button onClick={clearSelection} className="text-xs px-3 py-1 rounded-full border border-white/10 hover:bg-white/5">Clear</button>}
            <button onClick={generateMix} disabled={selectedTopics.length===0} className="text-xs px-4 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white disabled:opacity-40">Generate Mix →</button>
          </div>
        </div>

        <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {topics.map(t=>{
            const active = selectedTopics.includes(t.name)
            return (
              <button key={t.name} onClick={()=> toggleTopic(t.name)} className={`text-left rounded-2xl border p-4 flex items-center gap-3 transition-colors ${active ? 'bg-white text-slate-900 border-white' : 'glass border-white/10 hover:border-white/20'}`}>
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white text-sm font-bold shrink-0" style={{background:t.color}}>{t.name.slice(0,2)}</div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${active ? 'text-slate-900' : ''}`}>{t.name}</div>
                  <div className={`text-xs ${active ? 'text-slate-500' : 'text-slate-400'}`}>{t.count} questions</div>
                </div>
                <div className={`w-5 h-5 rounded-full border grid place-items-center shrink-0 ${active ? 'bg-slate-900 border-slate-900 text-white' : 'border-white/20'}`}>{active && '✓'}</div>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <Link to="/learn?mix=recall" onClick={()=> { if(selectedTopics.length===0) { setSelectedTopics([]); setSelectedBundle(null)} }} className="flex-1 py-2.5 rounded-full glass border border-white/10 text-center text-sm hover:bg-white/5">Continue with {selectedTopics.length ? selectedTopics.join(', ') : 'All topics'} (mixed)</Link>
        </div>
      </div>

      {/* All single topics quick start (backward compat) */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topics.map(t=>(
          <div key={t.name+'-single'} className="rounded-2xl glass border border-white/10 p-6">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-white text-sm font-bold" style={{background:t.color}}>{t.name.slice(0,2)}</div>
              <span className="text-xs text-slate-400">{t.count}</span>
            </div>
            <h3 className="mt-4 font-medium">{t.name}</h3>
            <Link to="/learn" onClick={()=>{ setSelectedTopic(t.name as any); setSelectedTopics([t.name]); setSelectedBundle(null) }} className="mt-4 block w-full py-2 rounded-full bg-white/5 border border-white/10 text-slate-200 text-sm font-medium text-center hover:bg-white hover:text-slate-900">Start single</Link>
          </div>
        ))}
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { TOPIC_COLORS } from '@/data/mockData'
import type { Topic } from '@/data/mockData'
import { useApp } from '@/store/AppContext'
import { useEffect, useState } from 'react'
import { recallApi } from '@/api/client'

type TopicRow = { name: Topic; count: number; color: string }

export default function Topics(){
  const { setSelectedTopic } = useApp()
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(()=>{
    recallApi.topics().then((res:any)=>{
      const arr = Array.isArray(res) ? res : res?.data ?? []
      if (arr.length) {
        setTopics(arr.map((t:any)=> ({ name: t.name as Topic, count: t.count, color: t.color || (TOPIC_COLORS as any)[t.name] || '#3B82F6' })))
      } else {
        setTopics([])
      }
    }).catch(()=>{ setTopics([]) })
      .finally(()=> setLoading(false))
  },[])
  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>
  if (topics.length === 0) return (
    <div className="text-center py-20 text-slate-400">
      <h2 className="text-lg font-semibold">No topics</h2>
    </div>
  )
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Topics</h1>
        <p className="text-slate-400 text-sm">Choose a topic</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {topics.map(t=>(
          <div key={t.name} className="rounded-2xl glass border border-white/10 p-6">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl grid place-items-center text-white text-sm font-bold" style={{background:t.color}}>{t.name.slice(0,2)}</div>
              <span className="text-xs text-slate-400">{t.count}</span>
            </div>
            <h3 className="mt-4 font-medium">{t.name}</h3>
            <Link to="/learn" onClick={()=>setSelectedTopic(t.name as any)} className="mt-4 block w-full py-2 rounded-full bg-white text-slate-900 text-sm font-medium text-center">Start</Link>
          </div>
        ))}
      </div>
    </div>
  )
}

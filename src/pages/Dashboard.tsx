import { Link } from 'react-router-dom'
import { Flame, Bookmark, Trophy, ArrowUpRight, Clock } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { useEffect, useRef, useState } from 'react'
import { recallApi } from '@/api/client'

export default function Dashboard(){
  const { questions, streak, user, loading, selectedTopics, selectedBundle } = useApp()
  const [progress, setProgress] = useState<any>(null)
  const didProgress = useRef(false)
  useEffect(()=>{
    if (!user) return
    if (didProgress.current) return
    didProgress.current = true
    recallApi.progress().then(setProgress).catch(()=>{})
  },[user])
  const mastered = progress?.mastered ?? questions.filter(q=>q.confidenceScore>=80).length
  const bookmarked = questions.filter(q=>q.bookmarked).length
  const reviewed = progress?.totalReviews ?? questions.filter(q=>q.reviewCount>0).length
  const week = progress?.weekly ?? []
  const byTopic = progress?.byTopic as any[] | undefined
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Good morning, {user?.name ?? 'there'}</h1>
          <p className="text-slate-400 text-sm">Streak: {streak} days{selectedBundle ? ` • ${selectedBundle}` : selectedTopics.length ? ` • ${selectedTopics.join(', ')}` : ''}</p>
        </div>
        <Link to="/learn?bundle=recall" className="px-6 py-3 rounded-full bg-white text-slate-900 text-sm font-medium flex items-center gap-2">Resume Bundle <ArrowUpRight className="w-4 h-4"/></Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {label:'Streak', value: loading && progress===null ? '…' : `${streak} days`, icon:Flame, sub: '', color:'from-orange-500 to-red-500'},
          {label:'Mastered', value:`${mastered}`, icon:Trophy, sub: '', color:'from-emerald-500 to-teal-500'},
          {label:'Reviewed', value:`${reviewed}`, icon:Clock, sub: '', color:'from-blue-600 to-cyan-500'},
          {label:'Bookmarks', value:`${bookmarked}`, icon:Bookmark, sub:'', color:'from-violet-600 to-indigo-500'},
        ].map(c=>(
          <div key={c.label} className="rounded-2xl glass p-5 border border-white/10">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} grid place-items-center`}><c.icon className="w-5 h-5 text-white"/></div>
            <div className="mt-4 text-2xl font-bold">{c.value}</div>
            <div className="text-sm text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl glass border border-white/10 p-6">
          <h3 className="font-semibold">Weekly Activity</h3>
          <div className="mt-4 h-[180px]">
            {week.length === 0 ? <div className="h-full grid place-items-center text-sm text-slate-500">No activity yet</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={week}>
                <XAxis dataKey="d" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12}} />
                <Tooltip contentStyle={{background:'#0F172A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12}} />
                <Area type="monotone" dataKey="v" stroke="#3B82F6" strokeWidth={2} fill="url(#grad)" />
                <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4}/><stop offset="100%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient></defs>
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl glass border border-white/10 p-6">
          <h3 className="font-semibold">Category Progress</h3>
          <div className="mt-4 space-y-3">
            {byTopic && byTopic.length > 0 ? byTopic.slice(0,5).map((c:any)=>{
              const pct = c.total ? Math.round(c.mastered / c.total * 100) : 0
              return (
              <div key={c.topic} className="flex items-center gap-3">
                <span className="text-sm w-32 truncate">{c.topic}</span>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-white" style={{width:`${pct}%`}}/></div>
                <span className="text-xs text-slate-400">{pct}%</span>
              </div>
            )}) : <div className="text-sm text-slate-500">No data yet</div>}
          </div>
          <Link to="/progress" className="mt-4 inline-flex text-sm text-slate-400 hover:text-white">View progress →</Link>
        </div>
      </div>

      <div className="rounded-2xl glass border border-white/10 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Continue</h3>
          <Link to="/learn" className="text-sm text-slate-400 hover:text-white">View all</Link>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          {questions.slice(0,3).map(q=>(
            <Link key={q.id} to="/learn" className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
              <div className="text-sm font-medium line-clamp-2 leading-snug">{q.question}</div>
              <div className="mt-2 text-xs text-slate-500">{q.topic} • {q.difficulty}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

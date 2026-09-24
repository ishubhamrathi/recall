import { useApp } from '@/store/AppContext'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { useEffect, useState } from 'react'
import { recallApi } from '@/api/client'

export default function Progress(){
  const { questions } = useApp()
  const [remote, setRemote] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(()=>{
    Promise.all([
      recallApi.progress().then(setRemote).catch(()=>{}),
      recallApi.streakDays(84).then((r:any)=>{
        if (r?.data) setRemote((prev:any)=> ({ ...(prev ?? {}), heatmap: r.data, streak: r.streak ?? prev?.streak }))
      }).catch(()=>{}),
    ]).finally(()=> setLoading(false))
  },[])
  // API-only per contract §3.5 — fallback to local questions only when API unreachable and questions exist
  const hasRemoteCounts = remote && typeof remote.mastered === 'number'
  const mastered = hasRemoteCounts ? remote.mastered : (loading ? 0 : questions.filter(q=>q.confidenceScore>=80).length)
  const familiar = hasRemoteCounts ? remote.familiar : (loading ? 0 : questions.filter(q=>q.confidenceScore>=50 && q.confidenceScore<80).length)
  const learning = hasRemoteCounts ? remote.learning : (loading ? 0 : questions.filter(q=>q.confidenceScore>=25 && q.confidenceScore<50).length)
  const fresh = hasRemoteCounts ? remote.new : (loading ? 0 : questions.filter(q=>q.confidenceScore<25).length)

  const pie = [
    {name:'Mastered', value:mastered, color:'#10B981'},
    {name:'Familiar', value:familiar, color:'#3B82F6'},
    {name:'Learning', value:learning, color:'#F59E0B'},
    {name:'New', value:fresh, color:'#64748B'},
  ]
  const cat = remote?.byTopic?.length ? remote.byTopic.map((b:any)=> ({ name: b.topic, mastered: b.mastered, total: b.total })) : []
  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold">Progress</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="rounded-2xl glass border border-white/10 p-6 text-center">
          <h3 className="font-semibold">Mastery Distribution</h3>
          <div className="h-[220px] mt-2"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} innerRadius={70} outerRadius={90} dataKey="value" stroke="none">{pie.map(e=><Cell key={e.name} fill={e.color}/>)}</Pie><Tooltip contentStyle={{background:'#0F172A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12}}/></PieChart></ResponsiveContainer></div>
          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
            {pie.map(p=><div key={p.name} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{background:p.color}}/> {p.name}: {p.value}</div>)}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl glass border border-white/10 p-6">
          <h3 className="font-semibold">By Topic</h3>
          {cat.length === 0 ? <div className="h-[260px] grid place-items-center text-sm text-slate-500">{loading ? 'Loading…' : 'No data'}</div> :
          <div className="h-[260px] mt-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={cat}><XAxis dataKey="name" tick={{fill:'#94a3b8', fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:'#94a3b8'}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#0F172A', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12}}/><Bar dataKey="mastered" fill="#fff" radius={[8,8,0,0]} /><Bar dataKey="total" fill="rgba(255,255,255,0.08)" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></div>
          }
        </div>
      </div>

      <div className="rounded-2xl glass border border-white/10 p-6">
        <h3 className="font-semibold">Streak</h3>
        {!remote?.heatmap ? <div className="mt-4 text-sm text-slate-500">{loading ? 'Loading…' : 'No activity yet'}</div> :
        <div className="mt-4 grid grid-cols-12 gap-1.5">
          {remote.heatmap.map((h:any,i:number)=>{
            const v = h.reviewsCount ?? h.count ?? 0
            const bg = v>8?'bg-emerald-500':v>5?'bg-white/40':v>2?'bg-white/20':'bg-white/5'
            return <div key={h.day ?? i} className={`aspect-square rounded-sm ${bg}`} title={`${h.day}: ${v}`} />
          })}
        </div>
        }
        <div className="mt-3 text-xs text-slate-500">Last 84 days</div>
      </div>

      <div className="rounded-2xl glass border border-white/10 p-6">
        <h3 className="font-semibold">Levels</h3>
        <div className="mt-4 grid md:grid-cols-4 gap-4">
          {[
            {l:'New', r:'0-25', d:'Just discovered'},
            {l:'Learning', r:'25-50', d:'Seen few times'},
            {l:'Familiar', r:'50-80', d:'Mostly known'},
            {l:'Mastered', r:'80-100', d:'Can teach others'},
          ].map(b=>(
            <div key={b.l} className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="font-semibold">{b.l} <span className="text-xs text-slate-400">{b.r}</span></div>
              <div className="text-xs text-slate-400 mt-1">{b.d}</div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-600 to-cyan-500" style={{width: b.l==='New'?'25%':b.l==='Learning'?'45%':b.l==='Familiar'?'70%':'90%'}}/></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/store/AppContext'
import { Search as SearchIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { recallApi } from '@/api/client'

export default function Search(){
  const { questions, search, setSearch } = useApp()
  const [remote, setRemote] = useState<any[] | null>(null)
  const localResults = useMemo(()=>{
    if(!search.trim()) return []
    const q = search.toLowerCase()
    return questions.filter(x=> x.question.toLowerCase().includes(q) || x.topic.toLowerCase().includes(q) || x.tags.some(t=>t.toLowerCase().includes(q)) || x.answer.toLowerCase().includes(q)).slice(0,20)
  }, [search, questions])

  // try Spring search (debounced 200ms) — fallback to local
  useEffect(()=>{
    if(!search.trim()) { setRemote(null); return }
    const id = setTimeout(async () => {
      try {
        const res: any = await recallApi.questions({ q: search, size: 20, status: 'approved' }).catch(()=> recallApi.search(search, { limit: 20 }))
        const data = res?.data ?? res ?? []
        if (Array.isArray(data) && data.length) {
          setRemote(data.map((r:any)=> ({
            id: String(r.id), topic: r.topic, difficulty: r.difficulty, question: r.question, answer: r.answer,
            tags: r.tags ?? [], bookmarked: r.bookmarked
          })))
        } else {
          setRemote(null)
        }
      } catch { setRemote(null) }
    }, 200)
    return ()=> clearTimeout(id)
  }, [search])

  const results = remote ?? localResults
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Search</h1>
      <div className="mt-4 relative">
        <SearchIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"/>
        <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by question, topic, keyword, tag..." className="w-full h-12 pl-10 pr-4 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
      </div>
      <div className="mt-6 space-y-3">
        {search && results.length===0 && <div className="text-center py-12 text-slate-400">No results for “{search}”</div>}
        {!search && <div className="text-center py-12 text-slate-500">Type to search</div>}
        {results.map(r=>(
          <div key={r.id} className="rounded-xl glass border border-white/10 p-4">
            <div className="flex gap-2 text-xs"><span className="px-2 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">{r.topic}</span><span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">{r.difficulty}</span></div>
            <div className="mt-2 font-medium">{r.question}</div>
            <div className="mt-1 text-sm text-slate-400 line-clamp-2">{r.answer}</div>
            <Link to="/learn" className="mt-3 inline-flex text-sm text-blue-400 hover:text-blue-300">Practice →</Link>
          </div>
        ))}
      </div>
    </div>
  )
}

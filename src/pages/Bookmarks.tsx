import { useApp } from '@/store/AppContext'
import { Bookmark, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Bookmarks(){
  const { questions, toggleBookmark } = useApp()
  const list = questions.filter(q=>q.bookmarked)
  if(list.length===0) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <div className="w-16 h-16 rounded-2xl glass border border-white/10 grid place-items-center mx-auto"><Bookmark className="w-7 h-7 text-slate-500"/></div>
      <h2 className="mt-4 text-xl font-semibold">No bookmarks yet</h2>
      <p className="text-slate-400 mt-2">Swipe up or press B on any card to save it for later. Your bookmarks will appear here.</p>
      <Link to="/learn" className="mt-6 inline-flex px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium">Start Swiping</Link>
    </div>
  )
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Bookmark className="w-5 h-5 text-amber-400"/> Bookmarks <span className="text-sm font-normal text-slate-400">{list.length} saved</span></h1>
      <div className="grid md:grid-cols-2 gap-4">
        {list.map(q=>(
          <div key={q.id} className="rounded-2xl glass border border-white/10 p-5">
            <div className="flex gap-2"><span className="text-xs px-2 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">{q.topic}</span><span className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10">{q.difficulty}</span></div>
            <div className="mt-3 font-medium leading-snug">{q.question}</div>
            <div className="mt-3 text-sm text-slate-400 line-clamp-2">{q.answer}</div>
            <div className="mt-4 flex gap-2">
              <Link to="/learn" className="flex-1 py-2 rounded-full bg-white text-slate-900 text-sm font-medium text-center">Practice</Link>
              <button onClick={()=>toggleBookmark(q.id)} className="px-4 py-2 rounded-full glass border border-white/10 text-sm flex items-center gap-2"><Trash2 className="w-4 h-4"/> Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

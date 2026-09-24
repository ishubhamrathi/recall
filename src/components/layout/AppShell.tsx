import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, Bookmark, LayoutDashboard, GraduationCap, BarChart3, Layers, PlusCircle, Menu, X, LogOut, Sparkles } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useState } from 'react'

const nav = [
  { label: 'Home', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Learn', icon: GraduationCap, path: '/learn' },
  { label: 'Topics', icon: Layers, path: '/topics' },
  { label: 'Bookmarks', icon: Bookmark, path: '/bookmarks' },
  { label: 'Progress', icon: BarChart3, path: '/progress' },
  { label: 'Contribute', icon: PlusCircle, path: '/contribute' },
]

export function TopNav() {
  const { search, setSearch, user, streak, signOut, showToast } = useApp()
  const navigate = useNavigate()
  const handleSignOut = async () => {
    try { await signOut(); showToast('Signed out'); navigate('/login') } catch { navigate('/login') }
  }
  return (
    <header className="sticky top-0 z-40 glass-strong border-b border-white/[0.06]">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-[64px] flex items-center gap-4">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-white grid place-items-center">
            <Sparkles className="w-5 h-5 text-slate-900" />
          </div>
          <span className="font-semibold text-[16px] tracking-tight">RECALL</span>
        </Link>

        <div className="flex-1 max-w-[560px] hidden md:flex items-center gap-2 ml-6 relative">
          <Search className="w-4 h-4 absolute left-3.5 text-slate-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') navigate('/search')}} placeholder="Search…" className="w-full h-10 pl-10 pr-4 rounded-full bg-white/[0.06] border border-white/10 outline-none focus:border-white/20 text-sm placeholder:text-slate-500" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <div className="hidden sm:flex items-center gap-3 pl-3">
              <div className="text-right leading-tight">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-slate-400">{streak} day streak</div>
              </div>
              <button onClick={handleSignOut} className="hidden sm:inline-flex ml-1 px-3 py-1.5 rounded-full border border-white/10 text-xs">Sign out</button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 pl-3">
              <Link to="/login" className="px-4 py-1.5 rounded-full bg-white text-slate-900 text-sm font-medium">Sign in</Link>
              <Link to="/register" className="px-4 py-1.5 rounded-full border border-white/10 text-sm">Sign up</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export function Sidebar({ hideTopBar }: { hideTopBar?: boolean }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useApp()
  const [open, setOpen] = useState(false)
  const topOffset = hideTopBar ? 'top-0 h-[100vh]' : 'top-[64px] h-[calc(100vh-64px)]'
  return (
    <>
      <button onClick={()=>setOpen(!open)} className="lg:hidden fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-white text-slate-900 grid place-items-center shadow-xl border border-white/20">
        {open ? <X className="w-5 h-5"/> : <Menu className="w-5 h-5"/>}
      </button>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex fixed lg:sticky ${topOffset} w-[260px] shrink-0 glass border-r border-white/[0.06] p-4 flex-col z-30 overflow-y-auto`}>
        <nav className="space-y-1">
          {nav.map(item => {
            const active = loc.pathname === item.path
            return <Link key={item.path+item.label} to={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${active ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </Link>
          })}
        </nav>
        <div className="mt-auto pt-6">
          {user ? <button onClick={async()=>{ await signOut(); navigate('/login')}} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white w-full px-3 py-2"><LogOut className="w-4 h-4"/> Sign out</button> : <Link to="/login" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white w-full px-3 py-2"><LogOut className="w-4 h-4"/> Sign in</Link>}
        </div>
      </aside>
      {/* Mobile fullscreen centered */}
      {open && (
        <div className="lg:hidden fixed inset-0 top-[64px] z-30 bg-[#050816] flex flex-col">
          <div className="flex-1 grid place-items-center p-8">
            <nav className="w-full max-w-[320px] space-y-3">
              {nav.map(item => {
                const active = loc.pathname === item.path
                return <Link key={item.path+item.label} to={item.path} onClick={()=>setOpen(false)} className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-[17px] font-medium transition-colors ${active ? 'bg-white text-slate-900' : 'text-white bg-white/5 border border-white/10'}`}>
                  <item.icon className="w-5 h-5" /> {item.label}
                </Link>
              })}
              <div className="pt-6 border-t border-white/10 mt-6">
                {user ? <button onClick={async()=>{ await signOut(); setOpen(false); navigate('/login')}} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 text-white"><LogOut className="w-4 h-4"/> Sign out</button> : <Link to="/login" onClick={()=>setOpen(false)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-slate-900 font-medium"><LogOut className="w-4 h-4"/> Sign in</Link>}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const isLearn = loc.pathname === '/learn'
  // hide top bar on learn when showing answers (we hide entirely on /learn for focus per request)
  const hideTopBar = isLearn
  return (
    <div className="min-h-screen bg-[#050816] relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-[400px] left-1/2 -translate-x-1/2 w-[900px] h-[700px] bg-blue-600/15 blur-[120px] rounded-full" />
        <div className="absolute top-[300px] -right-60 w-[600px] h-[600px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>
      {!hideTopBar && <TopNav />}
      <div className="max-w-[1600px] mx-auto flex relative">
        <Sidebar hideTopBar={hideTopBar} />
        <main className="flex-1 min-w-0 px-4 lg:px-8 py-6 lg:py-8">{children}</main>
      </div>
    </div>
  )
}

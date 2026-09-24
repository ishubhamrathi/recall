import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Zap, Repeat, BarChart3, Sparkles, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#050816] text-slate-100 relative overflow-hidden">
      {/* bg */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-gradient-to-r from-blue-600/20 via-cyan-500/20 to-violet-600/20 blur-[120px] rounded-full" />
        <div className="absolute top-[600px] -left-40 w-[600px] h-[600px] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-10 max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 grid place-items-center"><Sparkles className="w-5 h-5 text-white" /></div>
          <span className="font-bold text-lg tracking-tight">RECALL</span>
          <span className="hidden md:inline text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">Interview OS</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#topics" className="hover:text-white">Topics</a>
          <a href="#pricing" className="hover:text-white">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-slate-300 hover:text-white">Sign in</Link>
          <Link to="/register" className="hidden sm:inline-flex"><Button>Sign up <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-12 lg:pt-20 pb-12 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <motion.h1 initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.05}} className="mt-6 text-[42px] lg:text-[64px] font-bold tracking-tight leading-[0.95]">
            Master Interviews <br /><span className="gradient-text">One Swipe At A Time</span>
          </motion.h1>
          <p className="mt-5 text-lg text-slate-400 leading-relaxed max-w-xl">Practice curated interview questions with spaced repetition.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/learn"><Button className="px-8 py-3.5 text-[15px]">Start Learning <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to="/topics"><Button variant="ghost">Explore Topics</Button></Link>
          </div>
        </div>

        <motion.div initial={{opacity:0, y:20}} animate={{opacity:1,y:0}} transition={{delay:0.15}} className="relative">
          {/* mock card stack */}
          <div className="relative mx-auto w-[340px] lg:w-[420px] h-[520px]">
            <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-blue-600/30 to-cyan-400/30 blur-2xl" />
            <div className="absolute top-4 left-4 right-4 bottom-4 rounded-[28px] glass rotate-[-3deg] border-white/10" />
            <div className="absolute top-2 left-2 right-2 bottom-2 rounded-[28px] glass rotate-[2deg] border-white/10" />
            <div className="absolute inset-0 rounded-[28px] glass-strong p-6 flex flex-col border border-white/10 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30">Java • Medium</span>
                <span className="w-8 h-8 rounded-full glass grid place-items-center"><Flame className="w-4 h-4 text-orange-400" /></span>
              </div>
              <h3 className="mt-8 text-xl font-semibold leading-snug">What is the difference between HashMap and ConcurrentHashMap?</h3>
              <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300">HashMap is non-synchronized and allows one null key…</div>
              <div className="mt-auto grid grid-cols-3 gap-3">
                <div className="rounded-2xl p-3 glass text-center"><div className="text-lg">👋</div><div className="text-xs text-slate-400">Need Practice</div></div>
                <div className="rounded-2xl p-3 bg-gradient-to-br from-blue-600 to-cyan-500 text-center text-white"><div className="text-lg">✓</div><div className="text-xs">Know It</div></div>
                <div className="rounded-2xl p-3 glass text-center"><div className="text-lg">🔖</div><div className="text-xs text-slate-400">Bookmark</div></div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {icon: Zap, title:'Swipe Learning', desc:'Swipe through questions.'},
            {icon: Repeat, title:'Smart Repetition', desc:'Weak concepts appear more often.'},
            {icon: BarChart3, title:'Progress Tracking', desc:'Streaks and mastery at a glance.'},
          ].map(f=>(
            <div key={f.title} className="rounded-2xl glass p-5">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center"><f.icon className="w-5 h-5 text-cyan-300" /></div>
              <h4 className="mt-4 font-semibold">{f.title}</h4>
              <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="topics" className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold">Topics</h2>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {['DSA','Java','Spring Boot','System Design','Networking','Database'].map(n=>(
            <Link key={n} to="/topics" className="rounded-2xl glass p-5">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-white font-bold text-xs">{n.slice(0,2)}</div>
              <div className="mt-3 font-medium">{n}</div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center text-sm text-slate-500">
        © 2026 RECALL
      </footer>
    </div>
  )
}

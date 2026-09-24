import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { Sparkles, ArrowRight } from 'lucide-react'

export default function Register(){
  const { register: doRegister, showToast } = useApp()
  const nav = useNavigate()
  const [form, setForm] = useState({ name:'', email:'', password:'' })
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})

  const submit = async (e:React.FormEvent)=>{
    e.preventDefault()
    setFieldErrors({})
    if (form.password.length < 8) return setFieldErrors({password:'Password must be at least 8 characters'})
    if (!form.name || !form.email) return showToast('Name, email & password required')
    setLoading(true)
    try {
      await doRegister(form.email, form.password, form.name)
      showToast('Account created')
      nav('/dashboard')
    } catch (err:any) {
      if (err.status === 409) showToast('Email already exists')
      else if (err.status === 400 && err.data?.fieldErrors) setFieldErrors(err.data.fieldErrors)
      else showToast(err.data?.error || err.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#050816] flex flex-col">
      <div className="pointer-events-none fixed inset-0"><div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[700px] bg-blue-600/15 blur-[120px] rounded-full" /></div>
      <nav className="relative z-10 max-w-7xl mx-auto w-full px-6 h-[64px] flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 grid place-items-center"><Sparkles className="w-5 h-5 text-white"/></div><span className="font-bold">RECALL</span></Link>
      </nav>
      <div className="flex-1 grid place-items-center px-6 py-12 relative z-10">
        <form onSubmit={submit} className="w-full max-w-[420px] rounded-[24px] glass-strong border border-white/10 p-8 space-y-5">
          <div>
            <h1 className="text-2xl font-bold">Create account</h1>
            <p className="text-sm text-slate-400 mt-1">Get started in seconds</p>
          </div>
          <label className="block space-y-1.5"><span className="text-sm text-slate-300">Name</span>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Shubham" required className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
            {fieldErrors.name && <span className="text-xs text-red-400">{fieldErrors.name}</span>}
          </label>
          <label className="block space-y-1.5"><span className="text-sm text-slate-300">Email</span>
            <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} type="email" required className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
            {fieldErrors.email && <span className="text-xs text-red-400">{fieldErrors.email}</span>}
          </label>
          <label className="block space-y-1.5"><span className="text-sm text-slate-300">Password (≥8)</span>
            <input value={form.password} onChange={e=>setForm({...form,password:e.target.value})} type="password" required minLength={8} className="w-full h-11 px-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
            {fieldErrors.password && <span className="text-xs text-red-400">{fieldErrors.password}</span>}
          </label>
          <button disabled={loading} className="w-full py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium disabled:opacity-60 flex items-center justify-center gap-2">{loading?'Creating…':'Create account'} <ArrowRight className="w-4 h-4"/></button>
          <div className="text-sm text-center text-slate-400">Have account? <Link to="/login" className="text-blue-400">Sign in</Link> • <Link to="/" className="text-slate-300">Home</Link></div>
        </form>
      </div>
    </div>
  )
}

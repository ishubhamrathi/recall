import { useCallback, useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { safeRedirect } from '@/lib/utils'
import { Sparkles, ArrowRight, Mail, Lock, User, ShieldCheck } from 'lucide-react'
import { GoogleSignInButton } from '@/components/ui/google-signin-button'

const RESEND_COOLDOWN_S = 30

export default function Register() {
  const { register: doRegister, signInWithGoogle, requestOtp, verifyOtp, showToast } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const redirectTo = safeRedirect(params.get('from'))

  // Two steps: credentials, then email verification. The account exists and the session
  // cookie is set after step 1; the code confirms the address is really theirs.
  const [step, setStep] = useState<'credentials' | 'verify'>('credentials')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeSent = useRef(false)

  useEffect(() => {
    if (!resendCooldown) return
    const t = setInterval(() => setResendCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  const sendCode = async () => {
    try {
      await requestOtp(form.email)
      setResendCooldown(RESEND_COOLDOWN_S)
    } catch {
      // The OTP endpoint may not be deployed yet, and the account is already usable at
      // this point — so a failed send must not trap the user on this step.
      setResendCooldown(RESEND_COOLDOWN_S)
    }
  }

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    if (form.password.length < 8) {
      setFieldErrors({ password: 'Password must be at least 8 characters' })
      return
    }
    if (!form.name || !form.email) {
      showToast('Name, email & password required')
      return
    }
    setLoading(true)
    try {
      await doRegister(form.email, form.password, form.name)
      setStep('verify')
      if (!codeSent.current) {
        codeSent.current = true
        await sendCode()
      }
    } catch (err: any) {
      if (err.status === 409) showToast('Email already exists — try signing in')
      else if (err.status === 400 && err.data?.fieldErrors) setFieldErrors(err.data.fieldErrors)
      else showToast(err.data?.error || err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    if (code.length !== 6) {
      setFieldErrors({ code: 'Enter the 6-digit code' })
      return
    }
    setLoading(true)
    try {
      await verifyOtp(form.email, code)
      showToast('Account verified')
      nav(redirectTo, { replace: true })
    } catch (err: any) {
      // The backend returns the same 400 for a wrong code and an unknown email, so this
      // message must not imply which one it was.
      if (err.status === 400) setFieldErrors({ code: err.data?.error || 'Invalid or expired code' })
      else if (err.status === 429) setFieldErrors({ code: 'Too many attempts. Request a new code.' })
      else showToast(err.data?.error || err.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (resendCooldown > 0) return
    setLoading(true)
    await sendCode()
    setLoading(false)
    showToast(resendCooldown > 0 ? 'New code sent' : 'Code sent — check your email')
  }

  const onGoogleCredential = useCallback(async (credential: string) => {
    // The server creates the account on the spot for a new address, so there is no credentials
    // step and no email code to wait for — a successful exchange is a signed-in user.
    await signInWithGoogle(credential)
    showToast('Signed up with Google')
    nav(redirectTo, { replace: true })
  }, [nav, redirectTo, showToast, signInWithGoogle])

  return (
    <div className="min-h-screen bg-[#050816] flex flex-col">
      <div className="pointer-events-none fixed inset-0"><div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[700px] bg-blue-600/15 blur-[120px] rounded-full" /></div>
      <nav className="relative z-10 max-w-7xl mx-auto w-full px-6 h-[64px] flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2"><div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 grid place-items-center"><Sparkles className="w-5 h-5 text-white"/></div><span className="font-bold">RECALL</span></Link>
      </nav>
      <div className="flex-1 grid place-items-center px-6 py-12 relative z-10">
        <div className="w-full max-w-[420px] rounded-[24px] glass-strong border border-white/10 p-8 space-y-5">
          {step === 'credentials' ? (
            <form onSubmit={submitCredentials} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold">Create account</h1>
                <p className="text-sm text-slate-400 mt-1">Get started in seconds</p>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm text-slate-300">Name</span>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" required autoComplete="name" className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
                </div>
                {fieldErrors.name && <span className="text-xs text-red-400">{fieldErrors.name}</span>}
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm text-slate-300">Email</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" required autoComplete="email" className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
                </div>
                {fieldErrors.email && <span className="text-xs text-red-400">{fieldErrors.email}</span>}
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm text-slate-300">Password (at least 8 characters)</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="w-full h-11 pl-10 pr-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50" />
                </div>
                {fieldErrors.password && <span className="text-xs text-red-400">{fieldErrors.password}</span>}
              </label>

              <button disabled={loading} className="w-full py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? 'Creating…' : 'Create account'} <ArrowRight className="w-4 h-4"/>
              </button>

              <GoogleSignInButton withDivider onCredential={onGoogleCredential} />

              <div className="text-sm text-center text-slate-400">
                <Link to={`/login?from=${encodeURIComponent(params.get('from') ?? '')}`} className="text-blue-400">Sign in</Link>
                <span className="mx-2">•</span>
                <Link to="/" className="text-slate-300">Home</Link>
              </div>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-5">
              <div className="text-center">
                <div className="mx-auto w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold mt-3">Verify your email</h1>
                <p className="text-sm text-slate-400 mt-1">We sent a 6-digit code to <span className="text-slate-200">{form.email}</span></p>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm text-slate-300">Code</span>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="w-full h-12 px-3 rounded-xl bg-white/5 border border-white/10 outline-none focus:border-blue-500/50 text-center text-2xl tracking-widest"
                />
                {fieldErrors.code && <span className="text-xs text-red-400">{fieldErrors.code}</span>}
              </label>

              <button disabled={loading} className="w-full py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? 'Verifying…' : 'Verify email'} <ArrowRight className="w-4 h-4"/>
              </button>

              <div className="text-sm text-center text-slate-400">
                <button type="button" onClick={resend} disabled={resendCooldown > 0 || loading} className="text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:hover:text-slate-600">
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
                <span className="mx-2">•</span>
                <Link to={redirectTo} className="text-slate-300">Skip for now</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

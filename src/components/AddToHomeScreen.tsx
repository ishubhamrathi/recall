import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Platform = 'ios' | 'android' | 'other'

function detectPlatform(): Platform {
  const ua = navigator.userAgent || ''
  const isIOS = /ipad|iphone|ipod/i.test(ua) && !/windows phone/i.test(ua)
  // treat Android + Chrome-like browsers as android (they fire beforeinstallprompt)
  const isAndroid = /android/i.test(ua)
  if (isIOS) return 'ios'
  if (isAndroid) return 'android'
  return 'other'
}

function isStandalone(): boolean {
  // already installed / running as PWA
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari
  if ((navigator as any).standalone === true) return true
  return false
}

const DISMISS_KEY = 'recall_a2hs_dismissed'
const SHOW_DELAY_MS = 4000

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function AddToHomeScreen() {
  const [platform, setPlatform] = useState<Platform>('other')
  const [installed, setInstalled] = useState(true) // start hidden until we measure
  const [show, setShow] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSSteps, setShowIOSSteps] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    const p = detectPlatform()
    setPlatform(p)
    if (p === 'other') return
    setInstalled(false)

    const dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    if (dismissed) return

    // Android/Chrome: wait for the browser's install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)

    const t = setTimeout(() => {
      // only auto-show on android if the browser actually offered a prompt;
      // on iOS we always show manual steps since there is no native prompt
      if (p === 'android' && !deferred) return
      setShow(true)
    }, SHOW_DELAY_MS)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // re-check deferred after state settles so android can prompt once it arrives
  useEffect(() => {
    if (platform !== 'android' || installed) return
    if (deferred && !show) {
      const t = setTimeout(() => setShow(true), 200)
      return () => clearTimeout(t)
    }
  }, [deferred, platform, installed, show])

  if (installed || platform === 'other' || !show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferred(null)
      dismiss()
    } catch {
      // user dismissed or prompt unavailable
    }
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="glass-strong rounded-2xl border border-white/15 shadow-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 grid place-items-center shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Add RECALL to your home screen</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {platform === 'ios'
              ? 'Tap share, then "Add to Home Screen".'
              : 'Install the app for offline access and a full-screen experience.'}
          </p>
          {platform === 'ios' && !showIOSSteps && (
            <button
              onClick={() => setShowIOSSteps(true)}
              className="text-xs text-cyan-300 hover:text-cyan-200 mt-1 underline-offset-2 hover:underline"
            >
              Show steps
            </button>
          )}
          {platform === 'ios' && showIOSSteps && (
            <ol className="text-xs text-slate-300 mt-2 list-decimal list-inside space-y-1">
              <li>Tap the <span className="font-semibold">share icon</span> at the bottom of Safari</li>
              <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span></li>
              <li>Tap <span className="font-semibold">Add</span> in the top-right</li>
            </ol>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {platform === 'android' && deferred ? (
            <Button className="px-3 py-1.5 text-xs" onClick={install}>Install</Button>
          ) : (
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={dismiss}>Dismiss</Button>
          )}
          <button onClick={dismiss} className="text-slate-500 hover:text-slate-300 p-1" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddToHomeScreen
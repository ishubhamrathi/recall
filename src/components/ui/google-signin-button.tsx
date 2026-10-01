// Google sign-in button, credential flow.
//
// Renders Google's own iframe button (brand guidelines forbid restyling it) and hands the
// resulting ID token to `onCredential`, which is expected to exchange it for a session. This
// component owns the error UX, because the 403 cases are specific to this endpoint and must be
// distinguishable from a generic sign-in failure.
//
// Renders nothing until the deployment says Google sign-in exists (the client id is read from
// the backend, or VITE_GOOGLE_CLIENT_ID overrides it), so a deployment without Google
// configured never shows a dead control.
import { useEffect, useRef, useState } from 'react'
import { GoogleAuthError, mountGoogleButton, resolveGoogleClientId } from '@/lib/googleAuth'

function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] uppercase tracking-widest text-slate-500">or</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}

/**
 * Normalises whatever the API client throws into a GoogleAuthError. The client attaches
 * `status` and the `{ error, hint }` body, which is all this needs to classify the failure.
 */
function toGoogleError(err: unknown): GoogleAuthError {
  if (err instanceof GoogleAuthError) return err
  const e = err as { status?: number; data?: { error?: string; hint?: string } } | null
  if (typeof e?.status === 'number') {
    return new GoogleAuthError(e.status, e.data?.error ?? 'Google sign-in failed', e.data?.hint ?? null)
  }
  // A network failure — the request never reached the server.
  return new GoogleAuthError(0, 'Google sign-in failed', 'Could not reach the server. Please try again.')
}

type Props = {
  /**
   * Exchanges the Google ID token for a session. Rejecting surfaces the error in place — the
   * rejection reason must carry a status for the failure to be classified, so throw the
   * client's error rather than a bare Error.
   */
  onCredential: (credential: string) => Promise<unknown>
  /** Renders the "or" rule above the button. */
  withDivider?: boolean
}

export function GoogleSignInButton({ onCredential, withDivider = false }: Props) {
  // undefined = still asking the deployment; null = Google sign-in is off here; string = go.
  const [clientId, setClientId] = useState<string | null | undefined>(undefined)
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Keep the latest callback without re-running the mount effect: the effect tears down and
  // rebuilds Google's iframe, and re-initializing it mid-popup would drop the response. Synced in
  // an effect rather than during render, which would read a ref value mid-render.
  const onCredentialRef = useRef(onCredential)
  useEffect(() => { onCredentialRef.current = onCredential })

  useEffect(() => {
    let disposed = false
    resolveGoogleClientId().then(id => { if (!disposed) setClientId(id) })
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    if (!clientId) return
    const el = container.current
    if (!el) return

    let disposed = false
    let cleanup: (() => void) | undefined
    mountGoogleButton(el, clientId, credential => {
      setBusy(true)
      setError(null)
      Promise.resolve(onCredentialRef.current(credential))
        .catch((err: unknown) => setError(describe(toGoogleError(err))))
        .finally(() => setBusy(false))
    }).then(
      fn => { if (disposed) fn(); else cleanup = fn },
      // A blocked or offline GSI script. Not fatal — the email form still works.
      () => { if (!disposed) setError('Could not load Google sign-in.') },
    )

    return () => { disposed = true; cleanup?.() }
  }, [clientId])

  if (!clientId) return null

  return (
    <div className="space-y-3">
      {withDivider && <OrDivider />}
      <div className="relative grid place-items-center min-h-11">
        <div ref={container} className={busy ? 'opacity-40 pointer-events-none' : ''} />
        {busy && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-5 h-5 rounded-full border-2 border-white/15 border-t-blue-400 animate-spin" />
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-amber-300/90 leading-relaxed">{error}</p>}
    </div>
  )
}

/** Maps a failure to what the user should actually do next. */
function describe(err: GoogleAuthError): string {
  if (err.needsLinking) {
    // Not the server's hint: it promises "link Google", but there is no linking endpoint yet,
    // so signing in with a password is the actual and only way forward.
    return 'An account already uses this email. Sign in with your email and password instead.'
  }
  if (err.status === 503) {
    // Backend has no GOOGLE_CLIENT_ID. Surfacing that verbatim tells the user nothing they can act on.
    return 'Google sign-in is unavailable right now. Please use your email and password.'
  }
  if (err.status === 0) return err.hint ?? 'Google sign-in failed. Please try again.'
  if (err.code === 'Email not allowed') return err.hint ?? 'This email address is not allowed to sign in.'
  if (err.code === 'Invalid Google credential') {
    // Expired token, wrong audience, or a client id from a different Google Cloud project.
    // Re-prompting is the only fix — retrying the same token cannot succeed.
    return 'Google could not verify that sign-in. Please try again.'
  }
  // Prefer `hint` — it explains the cause, while `error` is only a stable machine code.
  return err.hint ?? 'Google sign-in failed. Please try again.'
}

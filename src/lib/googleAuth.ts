// Google Sign-In, credential (ID token) flow — the only flow the backend supports.
//
// The browser asks Google Identity Services for a signed ID token, then posts that token to
// POST /api/auth/google. The server verifies it against Google's published keys and mints the
// same SESSION cookie every other sign-in method returns. There is no client secret here, and
// the server-redirect endpoints (GET /api/auth/google[/callback]) no longer exist.
//
// This module is transport only — the button renders, the script loads, the token is validated
// as a string. The exchange itself is `recallApi.auth.google` in api/client.ts.
//
// The GSI script is loaded on demand rather than from index.html: it is only needed by signed-out
// visitors, and every other page load should not pay for it.

import { recallApi } from '@/api/client'

/**
 * Fallback Google client id, used only when the deployment cannot be asked. Normally unset:
 * the backend's own `GET /api/auth/google/config` is the source of truth, because that is the
 * id the audience check accepts — a second copy in .env drifts the moment GOOGLE_CLIENT_ID
 * changes server-side.
 *
 * Public by design — the client id ships in the bundle. The *secret* never does.
 */
const ENV_GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()

/** Resolved once per page load: the client id to initialize GIS with, or null when Google sign-in is off here. */
let resolvedClientId: string | null | undefined
/** In-flight lookup, so StrictMode's double effect and two buttons do not both hit the server. */
let pendingClientId: Promise<string | null> | null = null

/**
 * The client id this deployment accepts tokens for, or null when Google sign-in is off here —
 * in which case the button is not rendered rather than rendered broken.
 */
export async function resolveGoogleClientId(): Promise<string | null> {
  if (resolvedClientId !== undefined) return resolvedClientId
  if (pendingClientId) return pendingClientId

  pendingClientId = fetchClientConfig().then(id => {
    pendingClientId = null
    if (id !== undefined) {
      // A definitive answer from the server — including "sign-in is off here" — wins, and is
      // cached for the page's lifetime.
      resolvedClientId = id
      return id
    }
    // The server could not be asked: the endpoint is not deployed yet, offline, or blocked.
    // VITE_GOOGLE_CLIENT_ID bridges that gap so a backend which predates the endpoint still
    // gets a working button. Deliberately not cached — the next mount asks again, so the
    // button switches to the server's value as soon as the endpoint appears.
    return ENV_GOOGLE_CLIENT_ID || null
  })
  return pendingClientId
}

/** The client id, `null` when the server says Google sign-in is off, `undefined` when the server could not be asked. */
async function fetchClientConfig(): Promise<string | null | undefined> {
  try {
    const cfg = await recallApi.auth.googleConfig()
    const id = (cfg?.clientId ?? '').trim()
    return cfg?.configured && id ? id : null
  } catch {
    // Endpoint not deployed yet (today that surfaces as the default-deny 401), offline, or
    // CORS-blocked. `undefined` tells the caller to fall back rather than to hide the button.
    return undefined
  }
}

type GsiCredentialResponse = { credential: string }

type GsiApi = {
  initialize: (config: Record<string, unknown>) => void
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
}

function gsi(): GsiApi | undefined {
  return (window as any).google?.accounts?.id
}

/**
 * A failed sign-in, carrying the server's stable `error` code and its human-readable `hint`.
 * Branch on the code, show the hint.
 */
export class GoogleAuthError extends Error {
  // Declared rather than as constructor parameter properties: this project compiles with
  // `erasableSyntaxOnly`, which forbids them.
  readonly status: number
  readonly code: string
  readonly hint: string | null

  constructor(status: number, code: string, hint: string | null) {
    super(code)
    this.name = 'GoogleAuthError'
    this.status = status
    this.code = code
    this.hint = hint
  }

  /**
   * The email already belongs to an account, but Google did not assert it controls that address,
   * so the server refuses to attach an external credential to it. Not retryable — the user has
   * to sign in with their existing method. This is the case to design for: existing users hit
   * it on their first Google sign-in.
   */
  get needsLinking() {
    return this.status === 403 && this.code === 'Account link required'
  }
}

let scriptPromise: Promise<void> | null = null

/** Loads accounts.google.com/gsi/client once and resolves when `google.accounts.id` is ready. */
export function loadGsi(): Promise<void> {
  if (gsi()) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => (gsi() ? resolve() : reject(new Error('Google Identity Services loaded without accounts.id')))
    s.onerror = () => {
      // Reset so a later mount (or a retry after the network recovers) can try again.
      scriptPromise = null
      s.remove()
      reject(new Error('Could not load Google Identity Services'))
    }
    document.head.appendChild(s)
  })
  // A rejected promise must not poison every later caller.
  scriptPromise.catch(() => { scriptPromise = null })
  return scriptPromise
}

/**
 * Renders Google's own button into `el` and resolves once it is on screen. Returns a cleanup
 * function that must run on unmount.
 *
 * `clientId` comes from {@link resolveGoogleClientId} — passing it in keeps the network call
 * out of the mount and lets the caller tell "not configured" (render nothing) apart from
 * "script failed to load" (render an error).
 */
export async function mountGoogleButton(
  el: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<() => void> {
  if (!clientId) throw new Error('No Google client id')

  await loadGsi()
  const id = gsi()
  if (!id) throw new Error('Google Identity Services is unavailable')

  id.initialize({
    client_id: clientId,
    // popup keeps the user in the SPA; 'redirect' would be a full page navigation.
    ux_mode: 'popup',
    callback: (r: GsiCredentialResponse) => {
      // The user closed the popup without picking an account — not an error worth surfacing.
      if (!r?.credential) return
      onCredential(r.credential)
    },
  })

  // renderButton appends an iframe. Wipe first so a StrictMode double-mount cannot stack two.
  el.replaceChildren()
  id.renderButton(el, {
    theme: 'outline_black',
    size: 'large',
    text: 'continue_with',
    width: 320,
  })

  return () => el.replaceChildren()
}

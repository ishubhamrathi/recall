/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /**
   * Fallback for the Google Sign-In client id, used only when the backend endpoint that
   * serves it (GET /api/auth/google/config) cannot be reached. Normally unset: that endpoint
   * returns the same GOOGLE_CLIENT_ID the server validates tokens against — one value, no
   * drift. Public by design either way; the client *secret* is never used by this flow and
   * must never be given a VITE_ prefix.
   */
  readonly VITE_GOOGLE_CLIENT_ID: string
  // NOTE: Do not add secrets with VITE_ prefix — Vite inlines them into the client bundle (public).
  // Use localStorage `recall_api_key` for PROJECT X-API-Key instead.
}

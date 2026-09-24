/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  // NOTE: Do not add secrets with VITE_ prefix — Vite inlines them into the client bundle (public).
  // Use localStorage `recall_api_key` for PROJECT X-API-Key instead.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

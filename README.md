# RECALL — Master Interviews One Swipe At A Time

Interview-focused spaced-repetition app. Swipe through curated questions (DSA, Java, Spring Boot, System Design, etc.), track confidence, bookmarks and streaks.

**Stack:** React 19 + TypeScript + Vite + Tailwind 4 + Framer Motion + Recharts.

## Quick Start

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL
npm run dev            # http://localhost:5173
npm run build          # production build -> dist/
npm run lint           # oxlint
```

## Env

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend base URL (no trailing slash) | `http://localhost:8080` |
| `VITE_GOOGLE_CLIENT_ID` | Fallback Google client id, used only if the backend endpoint is unreachable | — (server decides) |
| `VITE_API_KEY` | Optional PROJECT api-key (alt to session cookie) | — |

## Project Structure

```
src/
  api/client.ts       # recallApi — all /api/recall + /api/auth calls
  lib/googleAuth.ts   # Google Identity Services loader + client id resolution + button mount
  store/AppContext.tsx# global state (questions, auth, bookmarks, progress)
  data/mockData.ts    # Topic/Difficulty types + color fallback
  components/
    layout/AppShell.tsx
    ui/button.tsx
    ui/google-signin-button.tsx
  pages/
    Landing, Dashboard, Learn, Bookmarks, Progress, Topics, Search,
    Contribute, Login, Register
  lib/utils.ts
docs/
  API_CONTRACT.md     # Full backend contract (Spring Boot /api/recall)
```

## Key Flows

- **Learn** (`/learn`) — swipeable card deck, auto-reveal timer (2600ms + 30ms/char, 3–8s), drag/keyboard (←/→/Space/B), posts `POST /api/recall/reviews`.
- **Bookmarks** — `POST/DELETE /api/recall/bookmarks`, local optimistic update with rollback + error toast on failure.
- **Progress / Dashboard** — `GET /api/recall/progress` + `GET /api/recall/streak-days?days=84`.
- **Contribute** — `POST /api/recall/questions` (goes `pending` unless ADMIN).

## Auth

**Sign-in is mandatory for every feature.** `src/App.tsx` `RequireAuth` guards
`/dashboard`, `/learn`, `/bookmarks`, `/progress`, `/topics`, `/contribute`, `/search`;
unauthenticated visits redirect to `/login?from=<path>` and return there after sign-in.
Only `/`, `/login`, `/register` are public.

The guard waits on `authReady` (AppContext) so a hard refresh does not bounce a signed-in
user. Question fetching is also gated on `user`, so no anonymous request is made.

Swipe actions are never dropped silently: failed reviews roll back the optimistic
`confidenceScore` and surface a toast (`AppContext.tsx` `updateConfidence` / `toggleBookmark`).

### Sign-in methods

Three methods, one credential. All of them set the same HttpOnly `SESSION` cookie
(`SameSite=None; Secure`, 24h) — there is no bearer token. `credentials: 'include'` is set in
`api/client.ts` for every call; writes additionally echo the readable `XSRF-TOKEN` cookie in
`X-XSRF-TOKEN`. `requestWithCsrfRetry` retries a write once on `403 Invalid CSRF token`.

- **Email + password** — `POST /api/auth/login`, `POST /api/auth/register` (409 means sign in
  instead), `POST /api/auth/logout`.
- **Google** — `lib/googleAuth.ts` loads Google Identity Services on demand, renders Google's own
  button, and posts the ID token to `POST /api/auth/google`. The server verifies it against
  Google's public JWKS and mints the same cookie. **Credential flow only** — the old
  `GET /api/auth/google[/callback]` server-redirect endpoints were removed server-side and are not
  a supported integration surface.
  The **client id is orchestrated through the backend**: on first render
  `lib/googleAuth.ts` calls `GET /api/auth/google/config` and uses the id the deployment
  itself will validate against, so there is no second copy in this repo to drift. If that
  endpoint cannot be reached it falls back to `VITE_GOOGLE_CLIENT_ID`; if neither is available
  the button is not rendered and email + password keeps working. A server answer of
  `configured: false` hides the button whatever `.env` says. The id must be a **Web
  application** client id from the **same Google Cloud project** as the backend's
  `GOOGLE_CLIENT_ID`, and this site's origin must be in both Google's
  *Authorized JavaScript origins* and the backend's CORS allowlist. No client secret is involved,
  and none may ever be given a `VITE_` prefix.
  `403 Account link required` means the email already belongs to an account that Google did not
  assert as verified; there is no linking endpoint yet, so the UI points the user at password
  sign-in.
- **Email code (OTP)** — `POST /api/auth/otp/request` + `/verify`. Used post-signup to confirm an
  address; resend is throttled to 1/30s to match the server limit.

Requires HTTPS in production: the `Secure` session cookie is dropped on plain HTTP, which looks
exactly like a session that never existed.

## Pending backend work

`docs/BACKEND_REQUIREMENTS_RECOMMENDATION.md` — interaction events (`recall_question_events`),
popularity rollup with Bayesian shrinkage, `POST /api/recall/events` batch ingest, and
`GET /api/recall/questions/recommended` (adaptive / popular / weakest / due, with an
explicit server-side cold-start fallback to `popular`).

`GET /api/auth/google/config` → `{ "configured": bool, "clientId": string }` (public, no
session) — lets this site read the Google client id from the deployment instead of copying
`GOOGLE_CLIENT_ID` into `.env`. Already consumed by `lib/googleAuth.ts`; until it ships, the
endpoint's default-deny `401` is read as "server could not be asked" (never as a session
expiry) and the client falls back to `VITE_GOOGLE_CLIENT_ID`. Contract in
`docs/API_CONTRACT.md` §4.

## API

All recall endpoints under `/api/recall` (see `docs/API_CONTRACT.md`). Auth is session cookie (`credentials: include`) or `X-API-Key` for PROJECT clients.

```
GET  /api/recall/questions?topic=Java&difficulty=Medium&page=0&size=20&q=HashMap
GET  /api/recall/topics
GET  /api/recall/search?q=hashmap&limit=20
POST /api/recall/reviews  { questionId, action: 'know'|'practice'|'bookmark', revealedAt, durationMs }
GET  /api/recall/progress
GET  /api/recall/streak-days?days=84
POST /api/recall/bookmarks { questionId }
```

## Lint & Build

Configured via `.oxlintrc.json` (React + TS). Vite alias `@` -> `src/`.

```bash
npm run lint
npm run build
```

## Deploy

Static SPA — any static host. Set `VITE_API_BASE_URL` to production API host (e.g. `https://platformbe.shubhamrathi.in`) and `VITE_GOOGLE_CLIENT_ID` if Google sign-in is enabled. Ensure backend CORS allows `Access-Control-Allow-credentials: true` and that the deployed origin is in its allowlist. The session cookie is `Secure`, so the site must be served over HTTPS.

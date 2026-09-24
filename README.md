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
| `VITE_API_KEY` | Optional PROJECT api-key (alt to session cookie) | — |

## Project Structure

```
src/
  api/client.ts       # recallApi — all /api/recall + /api/auth calls
  store/AppContext.tsx# global state (questions, auth, bookmarks, progress)
  data/mockData.ts    # Topic/Difficulty types + color fallback
  components/
    layout/AppShell.tsx
    ui/button.tsx
  pages/
    Landing, Dashboard, Learn, Bookmarks, Progress, Topics, Search,
    Contribute, Login, Register
  lib/utils.ts
docs/
  API_CONTRACT.md     # Full backend contract (Spring Boot /api/recall)
```

## Key Flows

- **Learn** (`/learn`) — swipeable card deck, auto-reveal timer (2600ms + 30ms/char, 3–8s), drag/keyboard (←/→/Space/B), posts `POST /api/recall/reviews`.
- **Bookmarks** — `POST/DELETE /api/recall/bookmarks`, local optimistic update.
- **Progress / Dashboard** — `GET /api/recall/progress` + `GET /api/recall/streak-days?days=84`.
- **Contribute** — `POST /api/recall/questions` (goes `pending` unless ADMIN).

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

Static SPA — any static host. Set `VITE_API_BASE_URL` to production API host (e.g. `https://platformbe.shubhamrathi.in`). Ensure backend CORS allows `Access-Control-Allow-Credentials: true`.

# reCALL — Updated Backend API Contract (v1 / Spring Boot)

> **Status:** v1.1 — Supabase contract adapted to this platform's Spring Boot backend.  
> **Base URL:** `https://<platform-host>` (prod: `https://platformbe.shubhamrathi.in`, local: `http://localhost:8080`)  
> **Auth:** Session cookie (HttpOnly `JSESSIONID`) via `POST /api/auth/*` — send `credentials: "include"` on every request. `X-API-Key` alternative for external PROJECT clients via Access Control.  
> **Content-Type:** `application/json` for all JSON endpoints. `Prefer: return=representation` not required (Spring always returns bodies).

This document is the **single source of truth** to replace the Supabase PostgREST contract (`reCALL — Backend API Contract v1`) with zero or minimal frontend changes. All Supabase REST/RLS/RPC concepts are re-expressed as Spring MVC endpoints backed by Postgres (`platform` schema) + Flyway migrations `V70+`.

---

## 1. What changed vs Supabase contract

| Supabase (original) | Spring Platform (this contract) | Frontend change required |
|---|---|---|
| `https://<project>.supabase.co/rest/v1` + `apikey` + `Authorization: Bearer <jwt>` | `https://<host>/api/recall/*` + session cookie (`credentials: include`) or `X-API-Key: <project-key>` | Replace `supabase.from()` / `supabase.auth` with `fetch`/`api` client. Remove `apikey` header. Keep same JSON shapes (field names support both `snake_case` and `camelCase`). |
| GoTrue `POST /auth/v1/signup` + `/token?grant_type=password` + JWT claims | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (existing, reused) | Map `display_name` → `name`. Read user from `GET /api/auth/me` instead of `GET /auth/v1/user`. |
| PostgREST query params (`topic=eq.Java`, `select=`, `fts`, `or(...ilike...)`) | Standard query params (`topic=Java&difficulty=Medium&tags=concurrency&q=HashMap&page=0&size=20`) | Replace PostgREST filter syntax with simple params (see §3.1). |
| `reviews` with `confidence_delta` computed in DB view, `user_question_stats` view | Same logic server-side; `GET /api/recall/reviews/stats` and `GET /api/recall/progress` return derived `confidenceScore`, `level`, `reviewCount` | Call new stats/progress endpoints instead of PostgREST views. |
| `bookmarks` join via `select=*,bookmarks!inner(user_id)` | `bookmarked` boolean computed per-user in question responses + dedicated bookmark endpoints | Check `bookmarked` field on question or use `GET /api/recall/bookmarks`. |
| `POST /rest/v1/reviews` with `revealed_at`, `duration_ms` + trigger on `streak_days` | `POST /api/recall/reviews` (same body), server trigger increments streak synchronously | No change except endpoint URL. `duration_ms` stays client-computed. |
| RPC `search_questions`, `get_progress`, `get_topics` | `GET /api/recall/search`, `GET /api/recall/progress`, `GET /api/recall/topics` | Replace `rpc/*` POST with GET. |
| RLS policies (`auth.uid() = author_id`) | Spring `SecurityUtils.currentUserId()` + row-level checks in service layer | Transparent. |
| Realtime `supabase.channel('questions')` | Polling or SSE `GET /api/recall/questions/stream` (optional, not in v1). v1 polls on Contribute approval. | Remove realtime subscription or poll every 30s. |
| Storage bucket `question-assets` | Existing `POST /api/assets/upload` + short link `/a/{id}` (Supabase Storage already proxied) | No change. |
| Auto-reveal timing `clamp(1400 + len*22, 1800, 5200)ms` | Unchanged — stays client-side in `Learn.tsx:AutoRevealButton` | None. |

**Reuse summary:** Auth, asset upload, CORS/session, API-key/Project access, and admin BDUI CRUD (`/api/v1/data/QST`) are reused as-is. New recall tables (`recall_questions`, `recall_reviews`, `recall_bookmarks`, `recall_learning_sessions`, `recall_streak_days`) are modeled 1:1 on the Supabase DDL.

---

## 2. Data Models (Postgres `platform` schema, Flyway `V70__Create_Recall_Tables.sql`)

### 2.1 `users` (existing, extends as `profiles`)

```sql
-- existing platform.users, reused as profiles
create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,
  password_hash varchar(255) not null,
  name varchar(255) not null,          -- maps to display_name
  role varchar(50) default 'USER',
  created_at timestamp default now(),
  updated_at timestamp default now(),
  deleted_at timestamp
);
-- recall adds streak columns via migration (nullable, computed)
alter table users add column if not exists streak_count int default 0;
alter table users add column if not exists longest_streak int default 0;
alter table users add column if not exists total_reviews int default 0;
alter table users add column if not exists avatar_url text;
```

### 2.2 `recall_questions` (mirrors Supabase `questions`, supports `question_sheet` fallback)

```sql
create table recall_questions (
  id uuid primary key default gen_random_uuid(),
  topic varchar(50) not null,                    -- enum: DSA, Java, Spring Boot, System Design, Networking, Operating System, Database, JavaScript, React, AI Engineering, DevOps
  difficulty varchar(20) not null,               -- Easy | Medium | Hard
  question text not null,
  answer text not null,
  explanation text not null,
  interview_notes text not null default '',
  follow_ups text[] not null default '{}',
  tags text[] not null default '{}',
  author_id uuid references users(id) on delete set null,
  is_community boolean default false,
  status varchar(20) default 'approved',         -- pending | approved | rejected
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index idx_recall_q_topic on recall_questions(topic);
create index idx_recall_q_status on recall_questions(status);
create index idx_recall_q_tags on recall_questions using gin(tags);
create index idx_recall_q_fts on recall_questions using gin(to_tsvector('english', question || ' ' || answer || ' ' || array_to_string(tags,' ')));
```

> `question_sheet` (legacy flat Q&A) remains for admin BDUI. The new `recall_questions` is what `GET /api/recall/questions` serves. Optional backfill trigger copies `question_sheet` rows into `recall_questions` if needed.

TS type (drop-in for `src/data/mockData.ts:Question`):
```ts
type Question = {
  id: string
  topic: Topic
  difficulty: Difficulty
  question: string
  answer: string
  explanation: string
  interviewNotes: string   // maps interview_notes
  followUps: string[]      // maps follow_ups
  tags: string[]
  authorId?: string | null
  isCommunity?: boolean
  status?: 'pending'|'approved'|'rejected'
  confidenceScore?: number  // derived per-user 0..100, not stored
  reviewCount?: number      // derived
  bookmarked?: boolean      // derived per-user
  createdAt?: string
  updatedAt?: string
}
```

### 2.3 `recall_reviews` (spaced repetition)

```sql
create table recall_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question_id uuid not null references recall_questions(id) on delete cascade,
  action varchar(20) not null,           -- know | practice | bookmark
  confidence_delta int not null,          -- +18 / -12 / 0
  revealed_at timestamptz,
  duration_ms int,
  created_at timestamptz default now()
);
create index idx_recall_reviews_user_q on recall_reviews(user_id, question_id);
create index idx_recall_reviews_user_created on recall_reviews(user_id, created_at desc);
```

Derived formula (same as Supabase view, computed in service):
```
confidenceScore = clamp(40 + sum(confidence_delta), 0, 100)
level = Mastered >=80 | Familiar >=50 | Learning >=25 | New
reviewCount = count(*)
```

### 2.4 `recall_bookmarks`

```sql
create table recall_bookmarks (
  user_id uuid not null references users(id) on delete cascade,
  question_id uuid not null references recall_questions(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, question_id)
);
```

### 2.5 `recall_learning_sessions`

```sql
create table recall_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  started_at timestamptz default now(),
  ended_at timestamptz,
  questions_seen int default 0,
  knows int default 0,
  practices int default 0
);
create index idx_recall_sessions_user on recall_learning_sessions(user_id, started_at desc);
```

### 2.6 `recall_streak_days`

```sql
create table recall_streak_days (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  reviews_count int default 0,
  primary key (user_id, day)
);
-- streak_count / longest_streak on users are materialized by service on each review insert
```

Bump trigger (equivalent to Supabase `bump_streak()`):
```sql
-- handled in RecallReviewService: upsert recall_streak_days + recompute users.streak_count / longest_streak
```

---

## 3. Endpoints

All recall endpoints are under `/api/recall`. Auth: session cookie (`credentials: include`). Public reads (approved questions) allow unauthenticated `GET`; mutations require auth. `X-API-Key` via Access Control grants PROJECT access when a rule exists for the path.

### 3.1 Questions

#### `GET /api/recall/questions`
List approved questions with filters, search, pagination, and per-user derived fields.

Query params:

| Param | Type | Description |
|---|---|---|
| `topic` | string | e.g. `Java` (Supabase `topic=eq.Java` → `topic=Java`) |
| `difficulty` | string | `Easy`/`Medium`/`Hard` |
| `tags` | string | Comma-separated, matches any tag `cs` (`tags=concurrency,collections`) |
| `q` | string | Full-text search over `question + answer + tags` (`plain` tsquery) |
| `authorId` | uuid | Filter by author (for My Contributions) |
| `status` | string | `approved` (default public), `pending`/`rejected` (author or ADMIN only) |
| `page` | int | 0-indexed, default 0 |
| `size` | int | default 20, max 100 |
| `sort` | string | `created_at.desc` (default), `created_at.asc` |

Response `200`:
```json
{
  "data": [
    {
      "id": "uuid",
      "topic": "Java",
      "difficulty": "Medium",
      "question": "What is the difference between HashMap and ConcurrentHashMap?",
      "answer": "HashMap is non-synchronized...",
      "explanation": "...",
      "interviewNotes": "Asked in Amazon...",
      "followUps": ["Concurrency","Collections"],
      "tags": ["hashmap","concurrency"],
      "authorId": null,
      "isCommunity": false,
      "status": "approved",
      "createdAt": "2026-09-24T10:00:00Z",
      "updatedAt": "2026-09-24T10:00:00Z",
      "confidenceScore": 58,
      "reviewCount": 3,
      "bookmarked": true
    }
  ],
  "page": 0,
  "size": 20,
  "total": 312,
  "totalPages": 16
}
```
Notes: `confidenceScore`/`reviewCount`/`bookmarked` are per-caller (0/false when anon). Full-text ranking is `ts_rank` desc, tie-breaker `created_at desc`.

#### `GET /api/recall/questions/{id}`
Single question, same shape as above (object, not array). `404` if not approved and caller is not author/ADMIN.

#### `POST /api/recall/questions` — Contribute
Auth required. `status` forced to `pending` unless caller is ADMIN (can set `approved`). `authorId` set to caller.

Request:
```json
{
  "topic": "Java",
  "difficulty": "Medium",
  "question": "Explain ...",
  "answer": "...",
  "explanation": "...",
  "interviewNotes": "...",
  "followUps": ["..."],
  "tags": ["concurrency"],
  "isCommunity": true
}
```
Response `201`: created question.

#### `PATCH /api/recall/questions/{id}` — Update own pending or ADMIN
Auth required. Only author or ADMIN. `400` if approved question edited by non-admin.

#### `DELETE /api/recall/questions/{id}`
Soft-delete (`deleted_at = now()`). Author or ADMIN.

#### Legacy fallback
`GET /api/content?type=question_sheets` and BDUI `QST` (`/api/v1/data/QST`) remain for admin console, but new feature work should use recall endpoints.

### 3.2 Reviews / Swipe Actions

#### `POST /api/recall/reviews`
Auth required.

Request:
```json
{ "questionId": "uuid", "action": "know", "revealedAt": "2026-09-24T10:01:00Z", "durationMs": 3200 }
```
- `action`: `know` (+18) | `practice` (-12) | `bookmark` (0, also creates bookmark)
- Server derives `confidence_delta` from `action`; client may omit it.
- Side effects: upsert `recall_streak_days` for today, bump `users.total_reviews`, recompute streak.

Response `201`:
```json
{ "id": "uuid", "confidenceScore": 58, "reviewCount": 4, "level": "Familiar", "streak": 12 }
```

Client mapping (unchanged):
- Swipe Right → `know` (+18)
- Swipe Left → `practice` (-12)
- Swipe Up / B → `POST /api/recall/bookmarks` (+ optional `bookmark` review)

#### `GET /api/recall/reviews?questionId=uuid`
Auth required. Returns caller's review history for a question.

#### `GET /api/recall/reviews/stats?questionId=uuid` or `GET /api/recall/reviews/stats` (all)
Auth required. Returns `user_question_stats` shape.

### 3.3 Bookmarks

#### `POST /api/recall/bookmarks` — body `{ "questionId": "uuid" }` → `201` (idempotent, `409` → `200`)
#### `DELETE /api/recall/bookmarks/{questionId}` → `204`
#### `GET /api/recall/bookmarks?page=0&size=20` → `200`
```json
{
  "data": [ { "id":"uuid", "topic":"Java", "bookmarked": true } ],
  "page": 0, "size": 20, "total": 18
}
```

### 3.4 Search

#### `GET /api/recall/search?q=hashmap&topic=Java&limit=20`
Debounced 200ms from `Search.tsx`. Equivalent to Supabase `rpc/search_questions`.

Response `200`:
```json
{ "data": [ { "id":"...", "question":"...", "answer":"...", "tags":["hashmap"], "topic":"Java" } ], "total": 7 }
```

Alternatively `GET /api/recall/questions?q=hashmap&topic=Java&size=20` is equivalent (recommended: use this to keep one list endpoint).

### 3.5 Progress / Stats

#### `GET /api/recall/progress`
Auth required. Replaces Supabase `rpc/get_progress`.

Response `200`:
```json
{
  "streak": 12,
  "longestStreak": 28,
  "totalReviews": 342,
  "mastered": 24,
  "familiar": 18,
  "learning": 22,
  "new": 46,
  "byTopic": [{ "topic":"Java","mastered":18,"total":30 }],
  "weekly": [{ "d":"Mon","v":12 }, { "d":"Tue","v":8 }, ...],
  "heatmap": [{ "day":"2026-09-01","count":5 }, ...]
}
```

#### `GET /api/recall/streak-days?days=84`
Auth required. Build heatmap 84 days.

### 3.6 Topics

#### `GET /api/recall/topics`
Public. Derived from `select topic, count(*) from recall_questions where status='approved' group by topic`.

Response `200`:
```json
[
  { "name":"Java","count":250,"color":"#F59E0B" },
  { "name":"DSA","count":180,"color":"#10B981" }
]
```

### 3.7 Sessions & Streaks

#### `POST /api/recall/sessions` → `201` `{ "id":"uuid","startedAt":"..." }`
Auth required. Creates `recall_learning_sessions`.

#### `PATCH /api/recall/sessions/{id}` — body `{ "endedAt":"...", "questionsSeen":12, "knows":8, "practices":4 }`
Auth required. Only owner.

### 3.8 Profiles

- `GET /api/auth/me` → `{ "id":"uuid","email":"a@b.com","name":"Shubham","role":"USER" }` + recall fields when `?include=recall`.
- `PUT /api/recall/profile` (optional v1) → `{ "name","avatarUrl" }`

---

## 4. Auth Details (reused)

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/auth/register` | POST | `{ "email","password","name" }` | `201 { "id","email","name","role" }` or `409` |
| `/api/auth/login` | POST | `{ "email","password" }` | `200 { "id","email","name","role" }` + `Set-Cookie: JSESSIONID=...` |
| `/api/auth/logout` | POST | — | `200 { "message":"Logged out successfully" }` |
| `/api/auth/me` | GET | — | `200 { "id","email","name","role" }` or `401` |

Frontend hydration:
```ts
const res = await fetch('/api/auth/me', { credentials: 'include' })
if (res.ok) setUser(await res.json())
```

Session config: `spring.session.store-type=jdbc`, `HttpSessionSecurityContextRepository`, `maximumSessions=1`, `withCredentials:true` on client.

---

## 5. Frontend Integration Plan (no UI change outside data layer)

`src/store/AppContext.tsx` currently uses `mockData` + `localStorage`. Replace with (session-based, no Supabase SDK):
```ts
const q = await fetch(`/api/recall/questions?topic=${topic}&difficulty=${difficulty}&page=${page}&size=${size}&q=${search}`, { credentials: 'include' }).then(r=>r.json())
// q.data → Question[] (already has bookmarked, confidenceScore)
await fetch('/api/recall/bookmarks', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ questionId }) })
await fetch('/api/recall/reviews', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ questionId, action:'know', revealedAt, durationMs }) })
const progress = await fetch('/api/recall/progress', { credentials:'include' }).then(r=>r.json())
const heatmap = await fetch('/api/recall/streak-days?days=84', { credentials:'include' }).then(r=>r.json())
```
Field renames (server accepts both; response is camelCase):
- `interview_notes` → `interviewNotes`
- `follow_ups` → `followUps`
- `author_id` → `authorId`
- `is_community` → `isCommunity`
- `confidence_delta` → `confidenceDelta`
- `question_id` → `questionId`

Auto-reveal stays client-side: `duration = clamp(1400 + question.length*22, 1800, 5200)` in `Learn.tsx:AutoRevealButton`.

Add to `frontend/src/api/client.ts`:
```ts
export const recallApi = {
  questions: (params) => request(`/api/recall/questions?${qs(params)}`),
  question: (id) => request(`/api/recall/questions/${id}`),
  createQuestion: (body) => request('/api/recall/questions', { method:'POST', body: JSON.stringify(body) }),
  reviews: { create: (body) => request('/api/recall/reviews', { method:'POST', body: JSON.stringify(body) }), stats: (qid?) => request(`/api/recall/reviews/stats${qid?'?questionId='+qid:''}`) },
  bookmarks: { list: () => request('/api/recall/bookmarks'), create: (qid) => request('/api/recall/bookmarks', { method:'POST', body: JSON.stringify({ questionId: qid }) }), remove: (qid) => request(`/api/recall/bookmarks/${qid}`, { method:'DELETE' }) },
  search: (q, params) => request(`/api/recall/search?q=${encodeURIComponent(q)}&${qs(params)}`),
  progress: () => request('/api/recall/progress'),
  streakDays: (days=84) => request(`/api/recall/streak-days?days=${days}`),
  topics: () => request('/api/recall/topics'),
  sessions: { create: () => request('/api/recall/sessions', { method:'POST' }), update: (id, body) => request(`/api/recall/sessions/${id}`, { method:'PATCH', body: JSON.stringify(body) }) },
}
```

---

## 6. Errors

Spring errors use `ApiError` envelope:

| Code | When | Body example |
|---|---|---|
| `400` | validation | `{ "error":"Validation failed","fieldErrors":{"question":"must not be blank"} }` |
| `401` | no session | `{ "error":"Not authenticated" }` |
| `403` | not author/ADMIN, or PROJECT key without rule | `{ "error":"Project access denied" }` |
| `404` | not found | `{ "error":"Record not found" }` |
| `409` | duplicate | `{ "error":"duplicate key violates unique constraint \"recall_bookmarks_pkey\"" }` |
| `429` | rate-limit | `{ "error":"Too many requests" }` |

---

## 7. Access Control

Existing model reused: endpoints are `ADMIN` by default; dynamic PROJECT access requires row in `api_access_rules`. For recall:

- Public (no auth): `GET /api/recall/questions`, `GET /api/recall/questions/{id}`, `GET /api/recall/topics`, `GET /api/recall/search`
- Authenticated: all `/api/recall/*` (session user)
- PROJECT (api-key): `X-API-Key: <raw>` via `ProjectApiKeyAuthFilter`

Recall paths are intentionally **not** in `api-access.yaml` so they stay ADMIN-by-default and are opened per-client via DB rules.

---

## 8. Versioning & Realtime

- Breaking changes bump to `/api/recall/v2/*`.
- Realtime: v1 polls `GET /api/recall/questions?status=approved&sort=created_at.desc&size=5`
- Storage: `question-assets` bucket maps to `platform_public_assets` via `POST /api/assets/upload`; short link `/a/{assetId}`

---

## 9. Example cURL (Spring, session cookie)

```bash
# login (stores JSESSIONID)
curl -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"secret"}'

# list (public, but with per-user fields when logged in)
curl -b cookies.txt "http://localhost:8080/api/recall/questions?topic=Java&size=5"

# search (public)
curl -b cookies.txt "http://localhost:8080/api/recall/search?q=HashMap&limit=10"

# swipe know
curl -b cookies.txt -X POST http://localhost:8080/api/recall/reviews \
  -H "Content-Type: application/json" \
  -d '{"questionId":"<uuid>","action":"know","revealedAt":"2026-09-24T10:01:00Z","durationMs":3200}'

# bookmark
curl -b cookies.txt -X POST http://localhost:8080/api/recall/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"questionId":"<uuid>"}'

# progress
curl -b cookies.txt http://localhost:8080/api/recall/progress

# contribute
curl -b cookies.txt -X POST http://localhost:8080/api/recall/questions \
  -H "Content-Type: application/json" \
  -d '{"topic":"Java","difficulty":"Medium","question":"Explain virtual threads","answer":"...","explanation":"...","interviewNotes":"...","followUps":["..."],"tags":["concurrency"]}'

# PROJECT api-key alternative
curl -H "X-API-Key: $PROJECT_KEY" http://localhost:8080/api/recall/questions?topic=Java
```

---

## 10. Migration Checklist to Cut Over from Supabase

1. Run `V70__Create_Recall_Tables.sql` (Flyway) — creates recall tables + backfills `users` streak columns + seeds topics.
2. Seed `recall_questions` from `question_sheet` if needed (one-off backfill script in `docs/RECALL_BACKFILL.md`).
3. Update `frontend/src/api/client.ts` to add `recallApi` (or replace Supabase client).
4. Replace `mockData.ts` + `localStorage` reads with `recallApi.questions()` / `recallApi.progress()` in `AppContext.tsx`, `Learn.tsx`, `Bookmarks.tsx`, `Search.tsx`, `Progress.tsx`.
5. Wire `toggleBookmark` → `recallApi.bookmarks.create/remove`, `updateConfidence` → `recallApi.reviews.create`.
6. Keep `question.length*22` auto-reveal logic client-side; send optional `revealedAt`/`durationMs` in reviews.
7. Remove `supabase-js` dependency or keep for Storage uploads only.
8. Verify CORS `AllowCredentials` + `VITE_API_BASE_URL` (already `credentials:include`).

```


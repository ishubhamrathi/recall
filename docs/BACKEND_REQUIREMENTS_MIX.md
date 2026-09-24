# Backend Requirements — Mixed Recall, Multi-Topic & Bundles

**Goal:** Fix current “always first question” behavior; enable true spaced-repetition recall (fresh + due interleaved) and multi-topic generation. Bundles like *Software Engineering*, *AI Engineer* must come from backend (single source of truth).

---

## 1) Current Problem (frontend)

- `AppContext` holds `selectedTopic: Topic|'All'` (single). `Learn` filters `questions.filter(q=>q.topic===selectedTopic)` then `idx=0` always shows first element, then sequential ` (i+1) % len`. No freshness, no due prioritization, no randomization.
- `Dashboard → Resume` just `<Link to="/learn">` — no queue generation, so it restarts at first question of the filtered set.
- `Topics` page fetches `GET /api/recall/topics` (single topics) and `setSelectedTopic(t.name)` — no multi-select, no bundles.

Expected: Resume / Learn should show a **shuffled mixed queue**: e.g. 40% due (low confidence / overdue), 30% learning, 30% fresh/new, with topics interleaved. User should be able to pick **multiple topics** or a **pre-built bundle** (e.g. Software Engineering = DSA + System Design + OS + Networking + Database).

---

## 2) Required Backend Changes

### 2.1 Topics — already exists, keep
`GET /api/recall/topics` → `[{name, count, color}]` (public). No change, but ensure `count` is filtered to `status='approved'`.

### 2.2 NEW: Topic Bundles (categories)
Source of truth in DB, not hard-coded in frontend.

**Table proposal:**
```sql
create table recall_topic_bundles (
  id uuid primary key default gen_random_uuid(),
  slug varchar(50) unique not null, -- e.g. 'software-engineering', 'ai-engineer', 'fullstack'
  name varchar(100) not null,        -- 'Software Engineering'
  description text not null,
  topics text[] not null,            -- e.g. '{DSA,System Design,Operating System,Networking,Database}'
  color varchar(20) not null,        -- gradient token e.g. '#0EA5E9'
  icon varchar(50),                  -- lucide icon name e.g. 'Layers'
  sort_order int default 0,
  created_at timestamptz default now()
);
create index on recall_topic_bundles(slug);
```
Seed:
- `software-engineering` → [DSA, System Design, Operating System, Networking, Database] #0EA5E9
- `ai-engineer` → [AI Engineering, DSA, Database, Java] #F97316
- `backend-engineer` → [Java, Spring Boot, System Design, Database, Networking] #22C55E
- `frontend-engineer` → [JavaScript, React, System Design] #61DAFB
- `fullstack` → [DSA, Java, Spring Boot, JavaScript, React, System Design, Database]

**Endpoint:**
```
GET /api/recall/topic-bundles
→ 200 [{ id, slug, name, description, topics: string[], color, icon, count: number }]
```
`count` = `select count(*) from recall_questions where topic = any(topics) and status='approved'`. Public, cacheable.

Admin CRUD (optional v1): `POST/PUT/DELETE /api/recall/topic-bundles` (ADMIN only) backed by `recall_topic_bundles`.

### 2.3 Questions — multi-topic + recall mix

**A) Multi-topic filter (backward compatible)**
```
GET /api/recall/questions?topics=DSA,Java,System%20Design
```
- Accept both `topic=Java` (single) and `topics=a,b,c` (comma-separated) — if both present, `topics` wins. Validate against enum `Topic` (from `mockData.ts`). Return `400` on unknown topic.

**B) Recall mix mode — the core fix**
```
GET /api/recall/questions?mix=recall&topics=...&size=20&excludeSeenToday=true
GET /api/recall/queue?topics=...&size=20&mode=recall   // alternative alias, pick one
```
Query params:
| param | type | notes |
|---|---|---|
| `mix` | `sequential` (default, current behavior) \| `recall` \| `fresh` \| `due` | `recall` = spaced mix; `sequential` = `created_at.desc` (legacy); `fresh` = only `reviewCount=0`; `due` = only overdue |
| `topics` | csv | filter before mixing |
| `difficulty` | `Easy,Medium,Hard` csv | optional |
| `size` | int 1..100 | default 20 |
| `seed` | string | optional deterministic shuffle (e.g. `2026-09-30:userId`) for pagination stability |
| `excludeSeenToday` | bool | if true, exclude questions already reviewed today (from `recall_reviews` today) |

**Response:** Same envelope as `GET /questions` but `data` is already mixed:
```json
{
  "data": [ { "id":"...", "topic":"Java", "confidenceScore":12, "reviewCount":1, "due":true, ... } ],
  "page":0,"size":20,"total":312,"totalPages":16,
  "meta": { "mix":"recall", "due":8, "learning":6, "fresh":6, "seed":"..." }
}
```

**Mix algorithm (backend, per-user):**
```sql
-- freshness
new: reviewCount=0
learning: 25 <= confidence < 80 and not due
familiar: confidence 50..79
due: confidence < 50 or overdue (now - last_review > interval)
  -- simple due via confidence: due if confidence < 50; better: use SM-2 interval from last recall_reviews.created_at
```
For `mix=recall`, backend should:
1. Fetch candidate set (filtered by topics/difficulty/status='approved', with per-user `confidenceScore`/`reviewCount`/`lastReviewedAt`/`due`).
2. Partition: `due` (40%), `learning` (30%), `fresh` (30%) — percentages configurable, but start 40/30/30.
3. Within each partition shuffle (seeded by `seed` or `userId+date`).
4. Interleave round-robin: due, fresh, learning, due, fresh... to avoid clustering same topic.
5. Optionally boost `due` priority: lowest confidence first.
6. If not enough due/fresh, fill from remaining.

Provide SQL sketch or service pseudocode in implementation.

**C) Optional: Persisted queue/session**
If we want Resume to truly continue where left off (not regenerate), add:
```
POST /api/recall/queue  { topics: string[], bundleSlug?: string, size:20 }
→ 201 { queueId: uuid, items: string[] }  // ordered IDs
GET  /api/recall/queue/{queueId}
PATCH /api/recall/queue/{queueId}/advance { questionId, action } // server advances pointer
```
For v1, stateless `GET ...?mix=recall&seed=...` is sufficient; frontend can store `queueId` in localStorage as fallback.

### 2.4 Extend topics endpoint to support bundles count
If we keep bundles table, `GET /api/recall/topics` unchanged; bundles endpoint provides aggregated counts.

### 2.5 Auth / Access
- `GET /api/recall/topic-bundles` — public.
- `GET /api/recall/questions?mix=recall` — auth `credentials: include` required to compute per-user confidence/due; anon gets `confidenceScore=40` and mix falls back to `fresh + random`.
- Rate limit `mix` like other recall endpoints.

---

## 3) Frontend Work (implemented in this PR with backend fallback)

Until bundles endpoint ships, frontend falls back to client-defined bundles (see `src/data/mockData.ts:TOPIC_BUNDLES`):

```ts
export const TOPIC_BUNDLES = [
  { slug:'software-engineering', name:'Software Engineering', topics:['DSA','System Design','Operating System','Networking','Database'], color:'#0EA5E9' },
  { slug:'ai-engineer', name:'AI Engineer', topics:['AI Engineering','DSA','Database','Java'], color:'#F97316' },
  ...
]
```

Flow:
- `Topics.tsx` now fetches `recallApi.topicBundles()` with fallback to `TOPIC_BUNDLES`; shows bundle cards + individual topics with multi-select checkboxes. “Generate Mix” CTA calls `setSelectedTopics([...])` or `setSelectedBundle(slug)` and navigates to `/learn?mix=recall`.
- `AppContext` changed `selectedTopic: Topic|'All'` → `selectedTopics: Topic[]` (empty = All) + `selectedBundle?: string`. Persisted in `localStorage`.
- `Learn.tsx` no longer `filter(q=>q.topic===selectedTopic)` + `idx`. Instead `getRecallQueue(questions, selectedTopics, selectedBundle)` builds client-side mix as interim: tries `GET /api/recall/questions?mix=recall&topics=...` first; on 404 fallback to local shuffle: partition by confidence, interleave, shuffle with `seed` = `today`. `idx` still cycles but queue is already mixed.
- `Dashboard.tsx` Resume now triggers `queue` generation (not just link) and shows selected bundle/topics.

Once backend ships, delete fallback and rely on `?mix=recall`.

---

## 4) Acceptance Criteria

- [ ] `GET /api/recall/topic-bundles` returns seeded bundles from DB.
- [ ] `GET /api/recall/questions?topics=DSA,Java` filters multi.
- [ ] `GET /api/recall/questions?mix=recall` returns interleaved due/fresh/learning mix, not just `created_at.desc`.
- [ ] Resume from Home shows not always first question, but fresh mix with old due questions interleaved.
- [ ] Frontend can generate mix via bundles even before backend (fallback) and switches seamlessly.

---

## 5) Migration / Seed

Add Flyway `V71__recall_bundles.sql` with table + seed rows. No data migration needed for existing questions. Document in `docs/API_CONTRACT.md §3.1` and `§3.6`.

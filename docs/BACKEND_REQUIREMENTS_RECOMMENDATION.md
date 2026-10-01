# Backend Requirements — Interaction Events & Question Recommendation

**Status:** Draft for backend team. Frontend is already sign-in gated and already sends
`know` / `practice` / `bookmark` actions. What is **missing** is everything needed for the
backend to *decide which question to ask*: there is no record of impressions (views), no
aggregate popularity signal, and no cold-start strategy.

**Companion docs:** `API_CONTRACT.md` §3.2 (reviews), `BACKEND_REQUIREMENTS_BUNDLE.md` §2.3 (recall mix).

---

## 1) Problem

Today the deck can only be ordered by per-user spaced repetition
(`GET /api/recall/questions?mix=recall`). That works *only* once a user has review history,
because `due` / `learning` partitions are derived from `recall_reviews` (`API_CONTRACT.md` §2.3).

Three gaps:

1. **No impression tracking.** We cannot tell which questions are actually *seen*. Only
   `know` / `practice` land in `recall_reviews`. A question the user skipped, or revealed and
   then abandoned, is invisible.
2. **No aggregate signal.** `sort` supports only `created_at.desc|asc`
   (`API_CONTRACT.md:196). There is no popularity ranking, so a brand-new user with zero
   history has nothing to be recommended.
3. **No cold-start path.** For a user with no reviews, `mix=recall` degrades to
   `fresh + random` with `confidenceScore=40` for everything
   (`BACKEND_REQUIREMENTS_BUNDLE.md:122). Random is not a recommendation.

**Consequence:** the frontend cannot ask "what should I show this user next?" beyond
time-based scheduling. Everything else — weak-topic targeting, trending questions,
desirable-difficulty targeting — is blocked on the data below.

---

## 2) New table — `recall_question_events`

Single append-only interaction log. `recall_reviews` stays as-is (it drives
`confidenceScore` / streaks and is the spaced-repetition source of truth); this table
captures *everything else*, including non-grading interactions.

```sql
create table recall_question_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  question_id    uuid not null references recall_questions(id) on delete cascade,

  event_type     varchar(20) not null,
  -- impression : card entered the viewport (a "view")
  -- reveal     : answer was shown
  -- skip       : card advanced without reveal (dwell below threshold)
  -- know       : swipe right   (mirrors a review)
  -- practice   : swipe left    (mirrors a review)
  -- bookmark   : swipe up / B
  -- unbookmark : bookmark removed

  source        varchar(20) not null default 'deck',
  -- deck | bundle | search | bookmarks | topics | contribute
  bundle_slug   varchar(50),
  position      int,          -- index within the served deck
  revealed_at   timestamptz,
  duration_ms   int,          -- time card was on screen
  client_event_id uuid,       -- idempotency key from client
  created_at    timestamptz not null default now(),

  constraint recall_question_events_type_chk check (
    event_type in ('impression','reveal','skip','know','practice','bookmark','unbookmark')
  )
);

-- hot path: "what has this user done recently"
create index idx_rqe_user_created  on recall_question_events (user_id, created_at desc);
-- hot path: "how popular is this question"
create index idx_rqe_question_type on recall_question_events (question_id, event_type);
-- hot path: recommendation candidate set
create index idx_rqe_question_created on recall_question_events (question_id, created_at desc);

-- retry safety: the client batches and may retry; dedupe on the client key
create unique index uq_rqe_client_event
  on recall_question_events (user_id, client_event_id)
  where client_event_id is not null;
```

**Retention:** raw `impression` rows are high-volume and low-value after ~30 days; roll them
into the aggregate (§3) and delete. `know` / `practice` must be retained as long as
`recall_reviews` is. Honour `DELETE /api/recall/account` data-export/erasure against both
tables (`user_id` cascade already covers it).

**Volume estimate:** ~2 events per card (impression + terminal action), ~40 cards/session
→ ~80 rows/session/user. Batch endpoint (§4) keeps this to one HTTP call per flush.

---

## 3) Aggregate — `recall_question_stats`

Denormalised rollup the recommendation query reads. Refresh via scheduled job (every
5–15 min) or on-write for hot questions. Materialized view is fine for v1.

```sql
create materialized view recall_question_stats as
select
  q.id as question_id,
  q.topic,
  q.difficulty,
  count(*) filter (where e.event_type = 'impression')  as view_count,
  count(*) filter (where e.event_type = 'reveal')      as reveal_count,
  count(*) filter (where e.event_type = 'know')        as know_count,
  count(*) filter (where e.event_type = 'practice')    as practice_count,
  count(*) filter (where e.event_type = 'skip')        as skip_count,
  count(distinct e.user_id) filter (where e.event_type = 'bookmark') as bookmarker_count,
  max(e.created_at)                                    as last_event_at
from recall_questions q
left join recall_question_events e on e.question_id = q.id
where q.status = 'approved'
group by q.id, q.topic, q.difficulty;

create unique index uq_rqs_question on recall_question_stats (question_id);
create index idx_rqs_topic on recall_question_stats (topic);
```

### 3.1 Popularity score (cold start)

Raw counts are unusable: a question with 1 review and 0 failures would outrank one with
400 reviews and 380 successes. Use **Bayesian shrinkage** toward the global mean, then
**recency decay** so stale popularity does not dominate.

```sql
-- global prior
with prior as (
  select
    coalesce(sum(know_count)::numeric / nullif(sum(know_count + practice_count), 0), 0.5) as p0,
    20 as a          -- prior strength: equivalent to 20 pseudo-observations
  from recall_question_stats
),
scored as (
  select
    s.*,
    -- shrunk know-rate; pulls sparse questions toward p0
    ((s.know_count + (select a from prior) * (select p0 from prior))
      / nullif(s.know_count + s.practice_count + (select a from prior), 0)) as know_rate,
    -- engagement: reveals per impression, bookmarks per viewer
    case when s.view_count = 0 then 0
         else (s.reveal_count::numeric / s.view_count) * 0.4
            + (least(s.bookmarker_count::numeric / nullif(s.view_count,0), 1)) * 0.6
    end as engagement
  from recall_question_stats s
)
select
  question_id, topic, difficulty,
  -- recency decay: half-life ~30 days
  (0.7 * know_rate + 0.3 * engagement)
    * exp(-ln(2) * coalesce(extract(epoch from (now() - last_event_at))/86400.0, 0) / 30.0)
    as popularity_score
from scored
where view_count > 0;
```

Tune the `0.7 / 0.3` weighting and the 30-day half-life against real data. Expose the final
score as `GET /api/recall/questions/popular?topics=&size=20` for debugging and for the
frontend's signed-out / no-history fallback.

---

## 4) New endpoint — batched event ingest

Auth required. The client must **not** POST per card — batch and flush (every ~10 events, or
on `visibilitychange`/`pagehide`) so a 40-card session is 4 requests, not 80.

```
POST /api/recall/events
```

Request:
```json
{
  "events": [
    { "clientEventId": "uuid", "questionId": "uuid", "eventType": "impression",
      "source": "bundle", "bundleSlug": "software-engineering", "position": 0 },
    { "clientEventId": "uuid", "questionId": "uuid", "eventType": "reveal",
      "source": "bundle", "bundleSlug": "software-engineering", "position": 0,
      "revealedAt": "2026-09-25T10:01:00Z", "durationMs": 3200 },
    { "clientEventId": "uuid", "questionId": "uuid", "eventType": "know",
      "source": "bundle", "bundleSlug": "software-engineering", "position": 0,
      "revealedAt": "2026-09-25T10:01:00Z", "durationMs": 3200 }
  ]
}
```

Response `202`:
```json
{ "accepted": 3, "duplicates": 0, "rejected": [] }
```

- Max **50** events per batch → `400` above that.
- `clientEventId` dedupes retries → count hits as `duplicates`, still `202`.
- Unknown `questionId` / bad `eventType` → listed in `rejected`, batch still `202` (do not
  fail the whole flush over one bad row).
- Rate limit: 60 requests/min/user.
- `know` / `practice` here are **analytics only**. Grading, `confidenceScore`, and streak
  side effects stay on `POST /api/recall/reviews` (`API_CONTRACT.md` §3.2) so there is one
  code path that can move a streak. Do not double-count.

---

## 5) New endpoint — recommendation

```
GET /api/recall/questions/recommended
    ?topics=DSA,Java
    &difficulty=Medium
    &size=20
    &strategy=adaptive|popular|weakest|due
    &excludeSeenToday=true
```

Auth required. Same response envelope as `GET /api/recall/questions`, plus `meta`:

```json
{
  "data": [ /* questions, with per-user confidenceScore/bookmarked */ ],
  "page": 0, "size": 20, "total": 312, "totalPages": 16,
  "meta": {
    "strategy": "adaptive",
    "fallback": "popular",
    "due": 8, "learning": 6, "fresh": 6,
    "reason": "cold_start"          // why this strategy was chosen
  }
}
```

### 5.1 Strategies

| `strategy` | Use when | Ordering |
|---|---|---|
| `adaptive` | **default**, user has history | 40% `due`, 30% `learning`, 30% `fresh`; interleaved round-robin to avoid topic clustering (§2.3 of the bundle doc) |
| `popular` | **no history / cold start**, or `due`+`learning` cannot fill `size` | `popularity_score` desc (§3.1) |
| `weakest` | user explicitly drilling | user's lowest `confidenceScore` first, tie-break `popularity_score` |
| `due` | "review due only" | `due` partition only; short deck if nothing is due |

### 5.2 Strategy resolution (server-side, explicit)

The client must **not** guess. The server resolves and reports via `meta`:

```
if user has no recall_reviews rows            -> strategy = popular, reason = "cold_start"
else if due + learning < size                 -> fill remainder from popular, fallback = "popular"
else                                          -> strategy = adaptive
```

This is the answer to "what do we recommend when we have no user basis?" — **popularity with
Bayesian shrinkage and recency decay**, not random. It is also the correct fallback for the
signed-out case described in §6.

### 5.3 Desirable difficulty (v2, flag-gated)

Target questions at the edge of ability rather than uniformly easy. Rank candidates by
`|user_accuracy_on_question − 0.85|` ascending, so the hardest and easiest fall to the
back. Requires enough per-user history to be meaningful; skip while `reviewCount < 5`.

---

## 6) Sign-in policy change (frontend already shipped)

The frontend now gates **every** feature route behind `RequireAuth` (`src/App.tsx`) —
`/dashboard`, `/learn`, `/bookmarks`, `/progress`, `/topics`, `/contribute`, `/search`.
Only `/`, `/login`, `/register` are public.

Consequences for the backend:

- `GET /api/recall/questions` and `?mix=recall` are now called **only with a session**. The
  documented anonymous fallback (`BACKEND_REQUIREMENTS_BUNDLE.md:122,
  `confidenceScore=40`, `fresh + random`) is **no longer exercised by our frontend** and can
  be deprecated. Keep it for one release in case other clients exist.
- This removes the reason `popular` was needed "for the signed-out case" — it is now needed
  for the **cold-start** case (§5.2), which is the common one: every brand-new user.
- No more silently-discarded swipes. Reviews and bookmarks previously failed with `401` and
  were swallowed client-side; they now surface a "Session expired" toast and roll back the
  optimistic score (`src/store/AppContext.tsx`).

---

## 7) Acceptance criteria

- [ ] `POST /api/recall/events` accepts a 50-event batch, dedupes on `clientEventId`, and
      returns `202` even when individual rows are rejected.
- [ ] `know`/`practice` via `/events` do **not** move streaks or `confidenceScore`; only
      `POST /reviews` does.
- [ ] `recall_question_stats` populates and refreshes on a schedule.
- [ ] `GET /api/recall/questions/recommended` returns `strategy=popular` + `reason=cold_start`
      for a user with zero reviews, and the order is stable across identical calls.
- [ ] A user with reviews gets `strategy=adaptive` and a `due/learning/fresh` mix, never a
      pure `created_at.desc` list.
- [ ] When `due + learning < size`, the remainder is filled by `popularity_score` and
      `meta.fallback = "popular"`.
- [ ] Sparse questions (1–5 events) do not outrank well-reviewed ones — shrinkage verified.
- [ ] Erasing a user account removes their rows from both `recall_question_events` and
      `recall_reviews`.

---

## 8) Frontend follow-up (blocked on §4)

Not implemented yet — deliberately, since there is no endpoint to call. Once §4 ships:

1. `src/api/client.ts` — add `events: { batch: (events) => request('/api/recall/events', { method:'POST', ... }) }`.
2. `src/store/AppContext.tsx` — an event queue in the provider: push on impression/reveal/
   terminal action, flush every 10 events and on `visibilitychange`/`pagehide`, generate a
   `clientEventId` per event via `crypto.randomUUID()`.
3. `src/pages/Learn.tsx` — `handleSwipe` (`Learn.tsx:458`) already maps right→`know`,
   left→`practice`, up→bookmark and passes `revealedAt` / `durationMs`; extend it to also
   emit `impression` on card mount and `reveal` in `handleReveal` (`Learn.tsx:440`), with
   `source`/`bundleSlug`/`position`.
4. `src/store/AppContext.tsx` — switch the deck fetch from `mix: 'recall'` to
   `GET /api/recall/questions/recommended`, letting the server own strategy resolution
   (§5.2) rather than the client guessing.
5. Retry once on network failure, then drop — the queue is analytics, and losing a swipe
   signal is preferable to blocking the user's next card.

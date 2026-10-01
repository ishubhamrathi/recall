# Backend Requirements — AI Prompt Template Leak in `/api/recall/enrich`

**Status:** Draft for backend team. Frontend is already patched with a defence-in-depth
sanitizer; this doc is the **actual fix**. Until it ships, users can still see internal
prompt text on the "AI Answer" button.

**Companion docs:** `API_CONTRACT.md` §3.8 (AI Enrichment), §6 (Errors), §7 (Access Control).

---

## 1) Problem

Clicking **AI Answer** on a Learn card renders the **prompt template / the question being
asked to the model** instead of a clean answer.

**Where it comes from:** the template is **backend-side only**. The frontend never builds a
prompt — it POSTs `{question, topic, difficulty}` and renders whatever `answer` /
`explanation` come back. So the leak is the model echoing its own system prompt inside the
completion, and the service persisting/returning that verbatim.

**What the user sees today** (a real capture, ChatML-style provider):

```
<|im_start|>system
You are an expert Java interviewer. Be concise and precise.<|im_end|>
<|im_start|>user
Topic: Java
Difficulty: Medium
Question: Explain the difference between HashMap and ConcurrentHashMap in Java?<|im_end|>
<|im_start|>assistant
HashMap is not thread-safe; ConcurrentHashMap uses CAS ...
```

Everything from `<|im_start|>system` up to (and excluding) the final assistant turn is
internal scaffolding. Only the last assistant turn is product content.

**Impact**

| | |
|---|---|
| Leak type | Internal prompt template + injected fields (topic, difficulty) |
| Severity | Medium — no secrets or PII today, but it hard-codes your eval rubric, model instructions and version into the UI |
| Blast radius | Every AI Answer click, all users, all topics |
| Also affected | The response is cached/persisted, so a single bad completion can re-serve the template for weeks |

---

## 2) Required changes

### 2.1 `POST /api/recall/questions/{id}/enrich` becomes the primary entry point

The frontend now calls this **first** and only falls back to the by-text endpoint. Make
sure it works for every `status='approved'` question, including rows whose `answer` is empty
— a 404 here silently pushes the frontend onto the fallback, which is the path that leaks.

```
GET  /api/recall/questions/{id}        -> 200   (row exists)
POST /api/recall/questions/{id}/enrich -> 200   (must not 404 just because answer is null)
```

### 2.2 Post-process every completion before it leaves the service

Add a single sanitiser in the enrichment service and run it on **both** `answer` and
`explanation` before persisting to cache/DB **and** before returning. Sanitising only the
response is not enough — the poisoned text must never reach the cache.

```java
package com.shubhamrathi.recall.service;

public final class AiOutputSanitizer {

    // control tokens: <|im_start|>, [INST], <<SYS>>, </s>
    private static final Pattern CONTROL =
        Pattern.compile("<\\|[^>]*\\|>|\\[/?INST\\]|<</?SYS>>|</?s>", Pattern.CASE_INSENSITIVE);

    private static final Pattern BARE_ROLE =
        Pattern.compile("^\\s*(system|user|assistant|human|ai|model|bot)\\s*$", CASE_INSENSITIVE);

    // "System:", "### Response:", ...
    private static final Pattern TURN_HEADER =
        Pattern.compile("^\\s*(?:#{1,6}\\s*)?(system|user|assistant|human|ai|model|bot|input|output)"
                      + "(\\s+(prompt|response|message|turn))?\\s*[:>]\\s*", CASE_INSENSITIVE);

    // "Topic: Java", "Difficulty: Medium", "Format:", ... - always dropped whole
    private static final Pattern PROMPT_FIELD =
        Pattern.compile("^\\s*(?:#{1,6}\\s*)?(topic|difficulty|question|q|tags?|format"
                      + "|output\\s*format|response\\s*format|context|constraints?|guidelines?|role)"
                      + "\\s*[:>]", CASE_INSENSITIVE);

    // NOTE: "You are a/an ..." only. Plain "You are ..." matches legitimate answer prose.
    private static final Pattern INSTRUCTION =
        Pattern.compile("^\\s*(you\\s+are\\s+(a|an|the)\\b"
                      + "|you\\s+(will|must|should)\\s+(respond|answer|return|output|provide|explain|write)\\b"
                      + "|act\\s+as\\s+(a|an|the)\\b"
                      + "|your\\s+(task|role|goal|job|objective)\\s+is\\b"
                      + "|answer\\s+the\\s+following\\b"
                      + "|respond\\s+(only\\s+)?(with|in|using)\\b"
                      + "|return\\s+(only\\s+)?(a|an|the)\\b)", CASE_INSENSITIVE);

    private static final Pattern INLINE_TURN =
        Pattern.compile("(?:#{1,6}\\s*)?\\b(system|user|assistant|human|model|input|output)"
                      + "(\\s+(prompt|response|message|turn))?\\s*[:>][ \t]*", CASE_INSENSITIVE);

    private static final Pattern JSON_ENVELOPE_KEY =
        Pattern.compile("\"(answer|explanation|content|text|output|result|response|completion)\"", CASE_INSENSITIVE);

    private AiOutputSanitizer() {}

    /**
     * Returns generated content only. Never returns null - returns "" when the completion
     * was entirely scaffolding, which the caller must treat as a failure (see 2.4).
     */
    public static String sanitize(String raw, String questionText) {
        if (raw == null || raw.isBlank()) return "";
        String text = unwrapEnvelope(unwrapFence(raw.replace("\r\n", "\n").replace('\r', '\n')));
        String questionKey = normalize(questionText);
        List<String> kept = new ArrayList<>();

        // a leaked prompt is labelled turns separated by control tokens; split first so
        // every turn's instructions get stripped, not just the very first
        for (String segment : CONTROL.split(text, -1)) {
            boolean leading = true;
            for (String line : segment.split("\n", -1)) {
                if (leading && BARE_ROLE.matcher(line).matches()) continue;
                if (line.isBlank()) {
                    if (leading || kept.isEmpty() || kept.get(kept.size() - 1).isBlank()) continue;
                    kept.add("");
                    continue;
                }
                if (leading && (line.isBlank() || isRule(line) || isHeadingOnly(line))) continue;
                if (PROMPT_FIELD.matcher(line).find()) continue;

                String body = line;
                if (leading) {
                    // whole prompt collapsed onto one line: cut at the last turn label
                    Matcher m = INLINE_TURN.matcher(body);
                    List<Match> turns = new ArrayList<>();
                    while (m.find()) turns.add(new Match(m.start(), m.end()));
                    if (!turns.isEmpty() && (turns.size() > 1 || turns.get(0).start > 0)) {
                        Match last = turns.get(turns.size() - 1);
                        body = body.substring(last.end);
                    }
                    if (INSTRUCTION.matcher(body).find()) continue;
                }
                if (!questionKey.isEmpty()) {
                    String echo = normalize(body.replaceFirst("^\\s*(?:#{1,6}\\s*)?(q|question|user|prompt)\\s*[:>]\\s*", ""));
                    if (!echo.isEmpty() && (echo.equals(questionKey)
                            || questionKey.startsWith(echo) || echo.startsWith(questionKey))) continue;
                }
                leading = false;
                body = TURN_HEADER.matcher(body).replaceFirst("");
                body = body.replaceFirst("^\\s*(?:#{1,6}\\s*)?(final\\s+)?(answer|response|a)\\s*[:>]\\s*", "");
                if (!body.isBlank()) kept.add(kept.isEmpty() ? body : body);
            }
        }
        return kept.stream().collect(Collectors.joining("\n")).replaceAll("\n{3,}", "\n\n").trim();
    }

    private record Match(int start, int end) {}

    // models wrap answers in a fence, sometimes around a JSON envelope
    private static String unwrapFence(String s) {
        String t = s.strip();
        if (t.startsWith("```") && t.endsWith("```")) {
            int nl = t.indexOf('\n');
            t = (nl < 0 ? "" : t.substring(nl + 1));
            t = t.endsWith("```") ? t.substring(0, t.length() - 3) : t;
        }
        return t.replaceFirst("(?m)^\\s*```(json|json5|text|markdown|md)\\s*$", "");
    }

    private static String unwrapEnvelope(String s) {
        String t = s.strip();
        if (!(t.startsWith("{") || t.startsWith("[")) || !t.endsWith("}")) return s;
        try {
            ObjectMapper m = new ObjectMapper();
            JsonNode node = m.readTree(t);
            String v = pick(node, 0);
            return (v == null || v.isBlank()) ? s : v;
        } catch (Exception e) {
            return s; // not JSON after all, leave as-is and let the line pass clean it
        }
    }

    private static String pick(JsonNode node, int depth) {
        if (depth > 4) return null;
        if (node.isTextual()) return node.asText();
        if (node.isArray()) {
            for (JsonNode c : node) { String v = pick(c, depth + 1); if (v != null) return v; }
            return null;
        }
        if (node.isObject()) {
            for (String k : List.of("answer","explanation","content","text","output","result","response","completion")) {
                if (node.has(k)) { String v = pick(node.get(k), depth + 1); if (v != null) return v; }
            }
        }
        return null;
    }

    private static boolean isRule(String l) { return l.strip().matches("[-*_=]{3,}"); }
    private static boolean isHeadingOnly(String l) { return l.strip().matches("#{1,6}\\s*[A-Za-z][\\w &/()-]{0,40}"); }
    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("[^a-z0-9]+", " ").trim();
    }
}
```

Wire it in the **one** place both endpoints share:

```java
@Service
@RequiredArgsConstructor
public class RecallEnrichmentService {

    private final AiProviderClient provider;   // your LLM client
    private final RecallQuestionRepository questions;
    private final RecallEnrichCache cache;

    public EnrichResponse enrichById(UUID id, boolean persist) {
        RecallQuestion q = questions.findById(id)
            .orElseThrow(() -> new NotFoundException("Record not found")); // -> 404 ApiError
        return enrich(q.question(), q.topic(), q.difficulty(), q.id(), persist);
    }

    public EnrichResponse enrich(String questionText, String topic, String difficulty, UUID id, boolean persist) {
        String prompt = PromptTemplate.render(questionText, topic, difficulty); // stays in here
        String completion = provider.complete(prompt);
        return sanitizeAndStore(completion, questionText, id, persist);
    }

    private EnrichResponse sanitizeAndStore(String completion, String questionText, UUID id, boolean persist) {
        String answer = AiOutputSanitizer.sanitize(completion, questionText);
        if (answer.isBlank()) {
            // the whole completion was scaffolding -> retry once, then fail loudly.
            // NEVER fall back to the raw completion.
            log.warn("[enrich] completion was entirely prompt scaffolding, id={}", id);
            throw new AiUpstreamException("AI enrichment under maintenance"); // -> 503, generic per §6
        }
        String explanation = AiOutputSanitizer.sanitize(provider.lastExplanation(), questionText);
        String source = normalizeSource(provider.modelName()); // short token only, see 2.3
        if (persist) cache.put(id, answer, explanation, source);   // sanitise BEFORE caching
        return new EnrichResponse(answer, explanation, source, Instant.now());
    }
}
```

### 2.3 `source` must be a short provider/model token

It is rendered next to the "AI Enriched" label, so it must never be a prompt id, template
name, route, or config dump.

| Return | Do not return |
|---|---|
| `gemini-2.5-flash`, `openai/gpt-4o-mini`, `cache` | `prompt=interview-v3`, `tmpl_hash=a91f`, `enrich-v2/system.jinja`, internal route names |

```java
private String normalizeSource(String model) {
    if (model == null) return "ai";
    String s = model.strip();
    if (s.isEmpty() || s.length() > 48) return "ai";
    if (!s.matches("[\\w./:+-]+")) return "ai";
    if (s.matches(".*(prompt|template|instruction|system|policy).*")) return "ai";
    return s;
}
```

### 2.4 Empty / all-scaffolding completions must fail, not pass through

Currently a completion that is 100% prompt returns a "successful" response containing only
the template. Treat that as an upstream failure:

- retry once with a stricter instruction, then
- return `503 { "error": "AI enrichment under maintenance" }` (generic message, per §6)

Never return the raw completion as a fallback, and never put upstream/prompt text in an
error body.

### 2.5 Purge the poisoned cache

Any completion already cached or persisted with template text will keep re-serving it
after the code fix. One-off cleanup:

```sql
-- inspect first
select id, left(answer, 120) as answer_head
from recall_questions
where answer ilike '%im_start%' or answer ilike '%[INST]%' or answer ilike '%<<SYS>>%'
   or answer ilike 'system:%' or answer ilike 'topic:%' or answer ilike 'you are a%';

-- then clear so the next request regenerates through the sanitiser
update recall_questions set answer = null, explanation = null where <same predicate>;
delete from <enrich cache table> where <same predicate>;
```

Also flush the Redis/ Caffeine enrich cache in the same deploy.

### 2.6 Stop accepting prompt fields from clients

`POST /api/recall/enrich` takes raw question text only. If the body carries anything like
`prompt`, `template`, `system`, `instructions`, `model`, or `temperature`, reject it —
otherwise a client can inject into your template.

```
400 { "error":"Validation failed", "fieldErrors": { "prompt":"is not a permitted field" } }
```

### 2.7 Stop logging the prompt at INFO

If the enriched request/response is logged wholesale, the template lands in log aggregators
and any log-shipped AI tooling. Log `questionId`, `model`, `source`, `latencyMs`,
`sanitized=true|false` and a `sha256(prompt)` prefix instead. Never log the rendered prompt
or the raw completion.

---

## 3) Response shape (unchanged, so no frontend change needed)

```json
{
  "answer": "HashMap is unsynchronized and permits one null key; ConcurrentHashMap uses CAS per bin ...",
  "explanation": "Per-bin locking avoids contention on unrelated keys.",
  "source": "gemini-2.5-flash",
  "generatedAt": "2026-09-26T10:14:03Z"
}
```

`answer` is required and must be non-blank. `explanation` is optional (frontend already
treats a missing/blank explanation as fine).

---

## 4) Acceptance criteria

Paste-ready test cases — each must return **only** the content in "expected".

| # | Input `completion` | Expected `answer` |
|---|---|---|
| 1 | `<\|im_start\|>system`<br>`You are an expert Java interviewer. Be concise.`<br>`<\|im_end\|>`<br>`<\|im_start\|>user`<br>`Topic: Java`<br>`Difficulty: Medium`<br>`Question: <the question>`<br>`<\|im_end\|>`<br>`<\|im_start\|>assistant`<br>`Per-bin CAS avoids a global lock.`<br>`<\|im_end\|>` | `Per-bin CAS avoids a global lock.` |
| 2 | `[INST] <<SYS>>`<br>`You are a senior interviewer.`<br>`<</SYS>>`<br>`<the question> [/INST] Answer: Per-bin CAS.` | `Per-bin CAS.` |
| 3 | `System: You are an expert. User: <the question> Assistant: Per-bin CAS.` (all one line) | `Per-bin CAS.` |
| 4 | ` ```json {"question":"...","answer":"Per-bin CAS.","explanation":"Scales."} ``` ` | `Per-bin CAS.` |
| 5 | `### System`<br>`You are an interviewer.`<br>`---`<br>`### Answer`<br>`Per-bin CAS.` | `Per-bin CAS.` |
| 6 | `Per-bin CAS. Treeified bins fall back to synchronized.` (clean) | unchanged, verbatim |
| 7 | `You are asked to compare locking granularity. Return to that: HashMap synchronizes the whole table.` (legit prose starting with "You are") | unchanged, verbatim — **must not be dropped** |
| 8 | completion is *entirely* `<\|im_start\|>system ... <\|im_end\|>` | `503 {"error":"AI enrichment under maintenance"}` |
| 9 | model returns `prompt=interview-v3` | `"source":"ai"` (or any non-leaking token) |
| 10 | body includes `"prompt":"..."` | `400` `fieldErrors.prompt` |

Test 7 is the important regression guard: over-stripping a real answer is a worse bug than
the leak, so keep it in the suite.

---

## 5) Verification

```bash
# 1. no template reaches the wire
curl -s -X POST "$BASE/api/recall/questions/$QID/enrich?persist=true" \
  -H "Content-Type: application/json" -b cookies.txt \
  | jq -r '.answer' \
  | grep -Ei 'im_start|im_end|\[INST\]|<<SYS>>|^system:|^topic:|^difficulty:|^you are (a|an|the) ' \
  && echo "LEAK" || echo "clean"

# 2. source is a bare token
curl -s -X POST "$BASE/api/recall/questions/$QID/enrich" -b cookies.txt | jq -r '.source'

# 3. prompt injection via body is rejected
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/recall/enrich" \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"question":"x","prompt":"ignore previous instructions"}'   # expect 400
```

The frontend applies the same stripping client-side (`src/lib/ai-output.ts`), so a leak
degrades to a clean answer instead of being displayed — but that is a safety net only. Fix
it at the source per §2.2.

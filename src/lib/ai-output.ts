// AI payloads are model output, not trusted UI text. The prompt template lives on the
// backend, and providers sometimes echo it back inside `answer`/`explanation`. That
// template is an internal implementation detail, so it must never be rendered: strip
// it here rather than trusting every response shape.

const WHOLE_FENCE = /^\s*```[a-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/i
const LANG_FENCE_LINE = /^\s*```(?:json|json5|text|markdown|md)\s*$/i

// Chat/completion control tokens: <|im_start|>, [INST], <<SYS>>, </s>, ...
const CONTROL_SPLIT = /<\|[^>]*\|>|\[\/?INST\]|<<\/?SYS>>|<\/?s>/i
// A bare role word on its own line, left behind after the control token is removed.
const BARE_ROLE = /^\s*(?:system|user|assistant|human|ai|model|bot)\s*$/i
// A leaked conversation turn header: "System:", "User:", "### Response:", ...
const TURN_HEADER = /^\s*(?:#{1,6}\s*)?(?:system|user|assistant|human|ai|model|bot|input|output)\s*(?:prompt|response|message|turn)?\s*[:>]\s*/i
// Prompt metadata the template interpolates: "Topic: Java", "Difficulty: Medium", ...
const PROMPT_FIELD = /^\s*(?:#{1,6}\s*)?(?:topic|difficulty|question|q|tags?|format|output\s*format|response\s*format|context|constraints?|guidelines?|role)\s*[:>]/i
// Instruction voice — only stripped while still inside the leading block, since a
// legitimate answer line can also start in that voice ("You are asked to ..."). The
// role-assignment and directive forms below do not occur in interview prose.
const INSTRUCTION_VOICE = /^\s*(?:you\s+are\s+(?:a|an|the)\b|you\s+(?:will|must|should)\s+(?:respond|answer|return|output|provide|explain|write)\b|act\s+as\s+(?:a|an|the)\b|your\s+(?:task|role|goal|job|objective)\s+is\b|answer\s+the\s+following\b|respond\s+(?:only\s+)?(?:with|in|using)\b|return\s+(?:only\s+)?(?:a|an|the)\b)/i
const RULE_LINE = /^\s*(?:[-*_=]{3,})\s*$/
const HEADING_ONLY = /^\s*#{1,6}\s*[A-Za-z][\w &/()-]{0,40}\s*$/
// "Answer:" / "A:" / "### Answer:" — a label the model prefixes the body with.
const ANSWER_LABEL = /^\s*(?:#{1,6}\s*)?(?:final\s+)?(?:answer|response|a)\s*[:>]\s*/i
// "Question:" / "Q:" / "User:" — a label in front of a restatement of the question.
const QUESTION_LABEL = /^\s*(?:#{1,6}\s*)?(?:q|question|user|prompt)\s*[:>]\s*/i
// Unanchored, so a whole prompt collapsed onto one line can be cut at its last turn.
const INLINE_TURN = /(?:#{1,6}\s*)?\b(?:system|user|assistant|human|model|input|output)(?:\s+(?:prompt|response|message|turn))?\s*[:>][ \t]*/gi

const ENVELOPE_KEYS = ['answer', 'explanation', 'content', 'text', 'output', 'result', 'response', 'completion']

function pickEnvelope(node: unknown, depth = 0): string | null {
  if (depth > 4) return null
  if (typeof node === 'string') return node.trim() ? node : null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = pickEnvelope(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    for (const key of ENVELOPE_KEYS) {
      if (key in (node as Record<string, unknown>)) {
        const found = pickEnvelope((node as Record<string, unknown>)[key], depth + 1)
        if (found) return found
      }
    }
  }
  return null
}

// Models love wrapping the answer in a JSON envelope: {"answer": "..."} or
// {"question": "...", "answer": "..."}. Unwrap so the payload is plain prose.
function unwrapEnvelope(text: string): string {
  const trimmed = text.trim()
  if (!/^[[{]/.test(trimmed) || !/[\]}]$/.test(trimmed)) return text
  try {
    return pickEnvelope(JSON.parse(trimmed)) ?? text
  } catch {
    return text
  }
}

function unwrapFence(text: string): string {
  const whole = text.match(WHOLE_FENCE)
  let body = whole ? whole[1] : text
  // nested ```json ... ``` left behind by the unwrap above
  const inner = body.match(WHOLE_FENCE)
  if (inner) body = inner[1]
  return body.replace(LANG_FENCE_LINE, '')
}

function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function sanitizeModelText(raw: unknown, opts: { question?: string } = {}): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''

  const text = unwrapEnvelope(unwrapFence(raw.replace(/\r\n?/g, '\n')))
  const questionKey = opts.question ? normalizeForCompare(opts.question) : ''
  const kept: string[] = []

  const push = (line: string) => {
    // only the first surviving line carries a label worth stripping
    kept.push(kept.length === 0 ? line.replace(ANSWER_LABEL, '') : line)
  }

  // A leaked prompt arrives as labelled turns separated by control tokens
  // (`<|im_start|>system ... <|im_start|>user ... <|im_start|>assistant ...`).
  // Split on the tokens first, then treat every segment as a fresh leading block so
  // each turn's instructions get stripped too — not just the very first one.
  for (const segment of text.split(CONTROL_SPLIT)) {
    let leading = true

    for (const line of segment.split('\n')) {
      if (BARE_ROLE.test(line) && leading) continue
      if (!line.trim()) {
        if (leading || !kept.length || !kept[kept.length - 1].trim()) continue
        kept.push('')
        continue
      }
      if (leading && (RULE_LINE.test(line) || HEADING_ONLY.test(line))) continue
      // the template's own interpolated fields, dropped whole: "Topic: Java"
      if (PROMPT_FIELD.test(line)) continue

      let body = line
      if (leading) {
        // a whole prompt collapsed onto one line:
        // "System: <rules> User: <question> Assistant: <answer>" — keep only the last turn
        const turns = [...body.matchAll(INLINE_TURN)]
        if (turns.length && (turns.length > 1 || (turns[0].index ?? 0) > 0)) {
          const last = turns[turns.length - 1]
          body = body.slice((last.index ?? 0) + last[0].length)
        }
        if (INSTRUCTION_VOICE.test(body)) continue
      }
      // a verbatim restatement of the question we already show above the card
      if (questionKey) {
        const echoKey = normalizeForCompare(body.replace(QUESTION_LABEL, ''))
        if (echoKey && (echoKey === questionKey || questionKey.startsWith(echoKey) || echoKey.startsWith(questionKey))) continue
      }

      leading = false
      body = body.replace(TURN_HEADER, '')
      // the header was the whole line; otherwise keep whatever followed it
      if (body.trim()) push(body)
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// `source` is displayed next to the "AI Enriched" label, so it must be a short
// provider/model token — never a prompt id, template name, or internal route.
export function sanitizeSourceLabel(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const s = raw.trim()
  if (!s || s.length > 48) return ''
  if (!/^[\w./:+-]+$/.test(s)) return ''
  if (/(prompt|template|instruction|system|policy)/i.test(s)) return ''
  return s
}

// ---------------------------------------------------------------------------
// v2 shape: answer / example / deepDive / sources / terms
// ---------------------------------------------------------------------------

export type EnrichSource = {
  n: number
  title: string
  url: string
  publisher: string
  snippet: string
}

export type EnrichTerm = { term: string; definition: string }

export type SanitizedEnrich = {
  /** the direct answer, markdown */
  answer: string
  /** a concrete worked example, markdown (may include a fenced code block) */
  example: string
  /** optional extra reading, markdown */
  deepDive: string
  /** numbered citations, rendered as a Perplexity-style list */
  sources: EnrichSource[]
  /** server-supplied definitions/abbreviations, merged with the local glossary */
  terms: EnrichTerm[]
  /** short provider/model token */
  model: string
  cached: boolean
}

const MAX_TITLE = 160
const MAX_SNIPPET = 320
const MAX_TERM = 60
const MAX_DEFINITION = 320

// strip C0/C1 control chars (keep tab + newline) without a control-char regex
function stripControl(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a) || c === 0x7f) continue
    out += ch
  }
  return out
}

function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return unwrapFence(stripControl(raw).replace(/\s+/g, ' ').trim()).slice(0, max)
}

/** Only http(s) links ever reach an href; javascript:/data: are dropped. */
function safeExternalUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const url = raw.trim()
  if (url.length > 2048) return ''
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return ''
  return url
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function pickArray(node: unknown): unknown[] {
  if (Array.isArray(node)) return node
  if (typeof node === 'string') return node.split('\n')
  if (node && typeof node === 'object') return Object.values(node as Record<string, unknown>)
  return []
}

function sanitizeSources(raw: unknown): EnrichSource[] {
  const out: EnrichSource[] = []
  const seen = new Set<string>()

  for (const item of pickArray(raw).slice(0, 12)) {
    // a bare "Title — https://…" line: no field names, just pull the link out
    if (typeof item === 'string') {
      const fromLine = safeExternalUrl(item.match(/https?:\/\/\S+/)?.[0])
      if (!fromLine) continue
      const title = cleanText(item.replace(/https?:\/\/\S+/, '').replace(/[\s—–-]+$/, ''), MAX_TITLE)
      const key = fromLine.replace(/[#?].*$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ n: out.length + 1, title: title || hostnameOf(fromLine), url: fromLine, publisher: hostnameOf(fromLine), snippet: '' })
      continue
    }

    const row = (item ?? {}) as Record<string, unknown>
    const url = safeExternalUrl(row.url) || safeExternalUrl(row.link) || safeExternalUrl(row.href)
    if (!url) continue

    const host = hostnameOf(url)
    const title = cleanText(row.title ?? row.name, MAX_TITLE) || host
    const key = url.replace(/[#?].*$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      n: out.length + 1,
      title,
      url,
      publisher: cleanText(row.publisher ?? row.site ?? row.domain, 60) || host,
      snippet: cleanText(row.snippet ?? row.description ?? row.summary, MAX_SNIPPET),
    })
  }

  return out
}

function sanitizeTerms(raw: unknown): EnrichTerm[] {
  const out: EnrichTerm[] = []
  const seen = new Set<string>()

  for (const item of pickArray(raw).slice(0, 24)) {
    if (typeof item === 'string') {
      const cut = item.search(/[:\-–—]\s/)
      if (cut < 1) continue
      addTerm(out, seen, item.slice(0, cut), item.slice(cut + 1))
      continue
    }
    const row = (item ?? {}) as Record<string, unknown>
    addTerm(
      out,
      seen,
      cleanText(row.term ?? row.name ?? row.keyword, MAX_TERM),
      cleanText(row.definition ?? row.meaning ?? row.description ?? row.expansion, MAX_DEFINITION),
    )
  }

  return out
}

function addTerm(out: EnrichTerm[], seen: Set<string>, term: string, definition: string) {
  const t = term.trim()
  const d = definition.trim()
  if (!t || !d) return
  const key = t.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  out.push({ term: t, definition: d })
}

/**
 * A v1 backend returns one markdown blob. Pull its `## Example` / `## Key points`
 * / `## Sources` sections into the v2 fields so the reader gets the same layout
 * either way, and the model can be rolled forward independently of the client.
 */
function splitMarkdownSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = text.split('\n')
  let key = ''
  let buf: string[] = []

  const flush = () => {
    const body = buf.join('\n').trim()
    if (key && body) sections[key] = body
    buf = []
  }

  for (const line of lines) {
    const h = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/)
    if (h) {
      flush()
      key = h[1].toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
      continue
    }
    if (key) buf.push(line)
  }
  flush()
  return sections
}

const EXAMPLE_KEYS = ['example', 'worked example', 'example walkthrough', 'walkthrough', 'practical example', 'concrete example']
const DEEPDIVE_KEYS = ['key points', 'key takeaways', 'why it works', 'deeper dive', 'deep dive', 'extra detail', 'additional detail', 'notes', 'trade offs', 'tradeoffs']
const SOURCE_KEYS = ['sources', 'references', 'further reading', 'citations', 'links']

function sectionAny(sections: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (sections[k]) return sections[k]
  return ''
}

function stripSections(text: string, keys: string[]): string {
  const lines = text.split('\n')
  const out: string[] = []
  let skipping = false
  for (const line of lines) {
    const h = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/)
    if (h) {
      const key = h[1].toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
      skipping = keys.includes(key)
      if (skipping) continue
    }
    if (!skipping) out.push(line)
  }
  return out.join('\n').trim()
}

function sourcesFromMarkdown(text: string): EnrichSource[] {
  const rows = text
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
  return sanitizeSources(rows)
}

/**
 * Last line of defence for the enrich endpoints. The backend is required to
 * return content-only fields, but if a provider leaks its prompt we drop it here
 * instead of showing internal scaffolding to the user.
 */
export function sanitizeEnrichResult(
  res: unknown,
  opts: { question?: string } = {},
): SanitizedEnrich | null {
  if (!res || typeof res !== 'object') return null
  const r = res as Record<string, unknown>

  const readText = (...keys: string[]) => {
    for (const k of keys) {
      const cleaned = sanitizeModelText(r[k], opts)
      if (cleaned) return cleaned
    }
    return ''
  }

  let answer = readText('answer', 'answerText', 'text')
  let example = sanitizeModelText(r.example ?? r.workedExample, opts)
  let deepDive = readText('deepDive', 'deep_dive', 'explanation', 'reasoning', 'detail')
  let sources = sanitizeSources(r.sources ?? r.citations ?? r.references)
  const terms = sanitizeTerms(r.terms ?? r.glossary ?? r.definitions)

  // v1 fallback: one markdown blob with `## Example` / `## Sources` sections.
  if (answer) {
    const sections = splitMarkdownSections(answer)
    const exampleSection = sectionAny(sections, EXAMPLE_KEYS)
    const deepDiveSection = sectionAny(sections, DEEPDIVE_KEYS)
    const sourceSection = sectionAny(sections, SOURCE_KEYS)

    if (!example && exampleSection) example = sanitizeModelText(exampleSection, opts)
    if (!deepDive && deepDiveSection) deepDive = sanitizeModelText(deepDiveSection, opts)
    if (!sources.length && sourceSection) sources = sourcesFromMarkdown(sourceSection)

    const hadSections = !!(exampleSection || deepDiveSection || sourceSection)
    if (hadSections) {
      const kept = [EXAMPLE_KEYS, DEEPDIVE_KEYS, SOURCE_KEYS].flat()
      answer = sanitizeModelText(stripSections(answer, kept), opts)
    }
  }

  if (!answer && !example) return null

  return {
    answer,
    example,
    deepDive,
    sources,
    terms,
    model: sanitizeSourceLabel(r.model ?? r.source ?? r.modelName),
    cached: r.cached === true || r.fromCache === true,
  }
}

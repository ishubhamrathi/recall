import { GLOSSARY, GLOSSARY_TERMS } from '@/data/glossary'

export type GlossaryEntry = { term: string; definition: string }

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Longest-first so "retrieval-augmented generation" wins over "generation"-ish
// prefixes, and one pass so a term repeated ten times is listed once.
const PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${GLOSSARY_TERMS.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
)

const cache = new Map<string, GlossaryEntry[]>()

/**
 * Reader-friendly alternative to a tooltip on every occurrence: pull the terms
 * that actually appear in the text out once, so they can be shown as a short
 * list under the content instead of being re-explained on hover.
 */
export function findGlossaryTerms(text: string | null | undefined): GlossaryEntry[] {
  if (!text) return []
  const hit = cache.get(text)
  if (hit) return hit

  const seen = new Set<string>()
  const found: GlossaryEntry[] = []
  for (const m of text.matchAll(PATTERN)) {
    const term = m[0]
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ term, definition: GLOSSARY[term] ?? '' })
  }

  cache.set(text, found)
  return found
}

/** Glossary entries for several fields at once, de-duplicated across them. */
export function findGlossaryTermsIn(...texts: (string | null | undefined)[]): GlossaryEntry[] {
  const seen = new Set<string>()
  const out: GlossaryEntry[] = []
  for (const text of texts) {
    for (const entry of findGlossaryTerms(text)) {
      const key = entry.term.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(entry)
    }
  }
  return out
}

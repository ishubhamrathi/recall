import { GLOSSARY, GLOSSARY_TERMS } from '@/data/glossary'

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export function GlossaryText({ text }: { text: string }) {
  if (!text) return null
  // Build regex for all terms as word-boundary or exact phrase
  const pattern = GLOSSARY_TERMS.map(t => `(${escapeRegExp(t)})`).join('|')
  const re = new RegExp(pattern, 'gi')
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  // Prevent infinite on zero-length
  while ((m = re.exec(text)) !== null) {
    const idx = m.index
    const match = m[0]
    if (idx > last) parts.push(text.slice(last, idx))
    const key = GLOSSARY_TERMS.find(k => k.toLowerCase() === match.toLowerCase()) || match
    const def = GLOSSARY[key] || GLOSSARY[match] || ''
    parts.push(
      <span key={idx + match} className="relative inline group/gloss border-b border-dotted border-blue-400/40 hover:border-blue-400 cursor-help decoration-dotted">
        <span className="text-blue-200 underline decoration-dotted underline-offset-4">{match}</span>
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/gloss:block z-20 w-[260px] p-2.5 rounded-xl bg-[#0B1020] border border-white/10 text-xs leading-relaxed text-slate-200 shadow-xl whitespace-normal">
          <span className="font-medium text-blue-300">{key}</span>: {def}
        </span>
      </span>
    )
    last = idx + match.length
    // avoid empty loop
    if (re.lastIndex === idx) re.lastIndex++
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

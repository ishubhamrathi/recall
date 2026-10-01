import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GlossaryEntry } from '@/lib/glossary'

/**
 * Definitions live here instead of on hover: one short, scannable list under the
 * content beats interrupting the reader on every occurrence of a dotted word.
 */
export function TermList({
  terms,
  title = 'Terms & abbreviations used',
  defaultOpen = false,
  className,
}: {
  terms: GlossaryEntry[]
  title?: string
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!terms.length) return null

  return (
    <div className={cn('rounded-xl bg-white/[0.03] border border-white/10', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-[11px] font-semibold tracking-widest text-slate-400 uppercase">
          {title}
        </span>
        <span className="text-[11px] text-slate-500">({terms.length})</span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-slate-500 ml-auto shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <dl className="px-3 pb-3 space-y-2.5 border-t border-white/[0.06] pt-3">
          {terms.map(t => (
            <div key={t.term.toLowerCase()}>
              <dt className="text-xs font-semibold text-blue-200">{t.term}</dt>
              <dd className="text-xs leading-relaxed text-slate-400 mt-0.5">{t.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

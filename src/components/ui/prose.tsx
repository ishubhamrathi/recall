import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// AI output is untrusted text, so this renders to React elements only — never
// dangerouslySetInnerHTML. It covers the subset the enrichment prompt is asked
// for: headings, paragraphs, bullet/numbered lists, fenced + inline code,
// bold/italic, blockquotes and links. Anything else degrades to plain text.

const INLINE =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^\s)]+\))/g

function safeHref(raw: string): string | null {
  const url = raw.trim()
  // relative app paths are fine; absolute links must be http(s) only, so
  // javascript:, data: and vbscript: can never reach an href.
  if (url.startsWith('/') && !url.startsWith('//')) return url
  if (!/^https?:\/\//i.test(url)) return null
  return url
}

function Inline({ text, base }: { text: string; base?: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${m.index}-${token.length}`

    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={key} className={cn('font-semibold text-slate-100', base)}>
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-200 border border-white/10"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('[')) {
      const cut = token.indexOf('](')
      const label = token.slice(1, cut)
      const href = safeHref(token.slice(cut + 2, -1))
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
          >
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        ),
      )
    } else {
      nodes.push(
        <em key={key} className="italic text-slate-200/90">
          {token.slice(1, -1)}
        </em>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[]; start: number }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; body: string }
  | { kind: 'hr' }

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/
const HEADING = /^\s*(#{1,6})\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*([-*_=]\s*){3,}$/
const FENCE = /^\s*```\s*([a-z0-9+#-]*)\s*$/i

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []

  const flushPara = () => {
    if (!para.length) return
    out.push({ kind: 'p', text: para.join(' ').trim() })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = line.match(FENCE)
    if (fence) {
      flushPara()
      const lang = fence[1].toLowerCase()
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      out.push({ kind: 'code', lang, body: body.join('\n').replace(/\n+$/, '') })
      continue
    }

    if (RULE.test(line) && line.trim().length >= 3) {
      flushPara()
      out.push({ kind: 'hr' })
      continue
    }

    const quote = line.match(QUOTE)
    if (quote) {
      flushPara()
      const body: string[] = [quote[1]]
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        i++
        body.push(lines[i].match(QUOTE)![1])
      }
      out.push({ kind: 'quote', text: body.join(' ').trim() })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      flushPara()
      out.push({ kind: 'h', level: heading[1].length, text: heading[2].trim() })
      continue
    }

    if (BULLET.test(line)) {
      flushPara()
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && BULLET.test(lines[i]) && !HEADING.test(lines[i])) {
        items.push(lines[i].replace(BULLET, '').trim())
        i++
      }
      i--
      if (ordered) {
        const start = Number((line.trim().match(/^(\d+)/)?.[1] ?? 1)) || 1
        out.push({ kind: 'ol', items, start })
      } else {
        out.push({ kind: 'ul', items })
      }
      continue
    }

    if (!line.trim()) {
      flushPara()
      continue
    }

    para.push(line.trim())
  }

  flushPara()
  return out
}

const HEADING_CLASS = [
  '',
  'text-[15px] font-semibold text-slate-100 mt-1',
  'text-sm font-semibold text-slate-100 mt-1',
  'text-sm font-semibold text-slate-100',
  'text-sm font-semibold text-slate-200',
  'text-xs font-semibold text-slate-300 uppercase tracking-wide',
  'text-xs font-semibold text-slate-300 uppercase tracking-wide',
]

export function Prose({ text, className }: { text?: string | null; className?: string }) {
  if (!text || !text.trim()) return null
  const blocks = parseBlocks(text)

  return (
    <div className={cn('text-sm leading-relaxed text-slate-300 space-y-3', className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h': {
            const Tag = `h${Math.min(6, Math.max(3, b.level))}` as 'h3' | 'h4' | 'h5' | 'h6'
            return (
              <Tag key={i} className={HEADING_CLASS[Math.min(6, b.level)]}>
                <Inline text={b.text} />
              </Tag>
            )
          }
          case 'p':
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            )
          case 'ul':
            return (
              <ul key={i} className="space-y-1.5 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-cyan-400/80 shrink-0 select-none">•</span>
                    <span className="min-w-0 flex-1">
                      <Inline text={it} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} start={b.start} className="space-y-1.5 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-cyan-400/80 shrink-0 select-none tabular-nums">
                      {b.start + j}.
                    </span>
                    <span className="min-w-0 flex-1">
                      <Inline text={it} />
                    </span>
                  </li>
                ))}
              </ol>
            )
          case 'quote':
            return (
              <blockquote
                key={i}
                className="border-l-2 border-cyan-400/40 pl-3 text-slate-400 italic"
              >
                <Inline text={b.text} />
              </blockquote>
            )
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-xl bg-[#0B1020] border border-white/10 p-3 custom-scrollbar"
              >
                <code className="font-mono text-xs leading-relaxed text-cyan-100/90">
                  {b.body}
                </code>
              </pre>
            )
          case 'hr':
            return <hr key={i} className="border-white/10" />
          default:
            return null
        }
      })}
    </div>
  )
}

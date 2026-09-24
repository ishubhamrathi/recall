import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

export function Button({ className, variant='primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'ghost'|'outline' }) {
  const base = "inline-flex items-center justify-center rounded-full font-medium transition-all text-sm px-6 py-3 cursor-pointer disabled:opacity-50"
  const styles: Record<string,string> = {
    primary: "bg-gradient-to-r from-[#3B82F6] to-[#06B6D4] text-white hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:scale-[1.02] active:scale-[0.98]",
    ghost: "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10",
    outline: "border border-white/15 text-slate-200 hover:bg-white/5"
  }
  const style = styles[variant]
  return <button className={cn(base, style, className)} {...props} />
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Only allow same-origin app paths, so a hand-edited ?from= can't become an
// open redirect. Blocks protocol-relative ("//evil.com") and auth loops.
export function safeRedirect(target: string | null | undefined, fallback = '/dashboard'): string {
  if (!target) return fallback
  if (!target.startsWith('/')) return fallback
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback
  const path = target.split('?')[0].replace(/\/$/, '')
  if (path === '/login' || path === '/register') return fallback
  return target
}

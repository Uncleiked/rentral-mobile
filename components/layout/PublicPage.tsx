import Link from 'next/link'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { RentralLogo } from '@/components/brand/RentralLogo'

export function PublicPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="min-h-dvh bg-background-app text-text-primary"><header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6"><Link href="/" className="text-2xl" aria-label="Rentral home"><RentralLogo /></Link><Link href="/marketplace" className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-4 py-2 text-xs">Explore <ArrowUpRight className="size-4" /></Link></header><main className="mx-auto max-w-3xl space-y-8 px-5 py-12 sm:py-20"><div><Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs text-text-muted"><ArrowLeft className="size-4" />Back to Rentral</Link><p className="text-xs uppercase tracking-widest text-accent-hover">{eyebrow}</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">{title}</h1></div><div className="space-y-8 text-sm leading-7 text-text-secondary">{children}</div></main><footer className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4 border-t border-border-subtle px-5 py-7 text-xs text-text-muted"><span>© {new Date().getFullYear()} Rentral</span><nav className="flex gap-5" aria-label="Information"><Link href="/help">Help</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer></div>
}

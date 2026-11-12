import Link from 'next/link'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { RentralLogo } from '@/components/brand/RentralLogo'

export function PublicPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="flex min-h-dvh min-w-0 flex-col bg-background-app text-text-primary">
    <a href="#public-content" className="sr-only z-[80] rounded-xl bg-accent-primary px-4 py-3 text-text-inverse focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <header className="mx-auto flex min-h-20 w-full max-w-5xl min-w-0 items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex min-h-11 items-center rounded-xl text-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover" aria-label="Rentral home"><RentralLogo /></Link>
      <Link href="/marketplace" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border-subtle px-4 text-xs font-semibold transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover">Explore <ArrowUpRight className="size-4" /></Link>
    </header>
    <main id="public-content" className="mx-auto w-full max-w-3xl min-w-0 flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      <div className="min-w-0">
        <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover sm:mb-8"><ArrowLeft className="size-4" />Back to Rentral</Link>
        <p className="break-words text-xs font-semibold uppercase tracking-widest text-accent-hover">{eyebrow}</p>
        <h1 className="mt-4 break-words text-3xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
      </div>
      <div className="min-w-0 space-y-8 break-words text-sm leading-7 text-text-secondary">{children}</div>
    </main>
    <footer className="mx-auto flex w-full max-w-5xl min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border-subtle px-4 py-5 text-xs text-text-muted sm:px-6 lg:px-8">
      <span>? {new Date().getFullYear()} Rentral</span>
      <nav className="flex flex-wrap gap-x-5" aria-label="Information">{[{ href: '/help', label: 'Help' }, { href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }].map(item => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-lg transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-hover">{item.label}</Link>)}</nav>
    </footer>
  </div>
}

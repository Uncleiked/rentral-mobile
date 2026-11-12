import Link from 'next/link'
import type { ReactNode } from 'react'
import { RentralLogo } from '@/components/brand/RentralLogo'
import { HeroBackground } from '@/components/ui/HeroBackground'

/** Shared shell for account entry, recovery and organization admission. */
export function AccountPage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <HeroBackground className="min-h-dvh text-text-primary">
    <div className="flex min-h-dvh min-w-0 flex-col">
      <header className="border-b border-glass-border-light">
        <div className="mx-auto flex min-h-20 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Rentral home" className="inline-flex min-h-11 items-center text-2xl"><RentralLogo /></Link>
          <Link href="/help" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-glass-light hover:text-text-primary">Need help?</Link>
        </div>
      </header>
      <main id="main-content" className={`relative mx-auto flex w-full min-w-0 flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-12 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 px-4 pb-5 text-xs text-text-secondary sm:px-6">
        <span>Rentral &middot; Your next starts here.</span>
        <nav aria-label="Account information" className="flex flex-wrap gap-x-5">
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-text-primary">Privacy</Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-text-primary">Terms</Link>
        </nav>
      </footer>
    </div>
  </HeroBackground>
}

'use client'

import Link from 'next/link'
import { AlertCircle, RotateCcw } from 'lucide-react'

export default function MarketplaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background-app px-6 text-center text-text-primary">
      <AlertCircle className="h-8 w-8 text-text-muted" aria-hidden="true" />
      <h1 className="text-xl font-semibold break-words">We could not load this page</h1>
      <p className="max-w-sm text-sm text-text-secondary">Please try again in a moment.</p>
      <button onClick={reset} className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-4 py-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover min-h-11 max-w-full whitespace-normal break-words">
        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again
      </button>
      <Link href="/" className="text-sm text-text-muted hover:text-text-primary min-h-11 max-w-full break-words inline-flex items-center">Return home</Link>
    </main>
  )
}

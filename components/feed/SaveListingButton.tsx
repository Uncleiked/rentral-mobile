'use client'

import { useState, useTransition } from 'react'
import { Heart, LoaderCircle } from 'lucide-react'
import { setListingSaved } from '@/app/actions/savedActions'
import { cn } from '@/lib/utils'

type Props = { listingId: string; saved: boolean; available: boolean; compact?: boolean; feedbackPosition?: 'button' | 'container' }

export function SaveListingButton({ listingId, saved: initialSaved, available, compact = false, feedbackPosition = 'button' }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  function save(): void {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await setListingSaved({ listingId, saved: !saved })
        if (result.success) setSaved(result.data.saved)
        else setError(result.error)
      } catch { setError('Unable to connect. Please try again.') }
    })
  }
  return <div className={cn(compact ? (feedbackPosition === 'container' ? 'static' : 'relative') : 'flex min-w-0 flex-col items-start gap-2')}>
    <button type="button" aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save listing'}
      disabled={!available || pending} title={!available ? 'Saving will be available soon' : undefined} onClick={save}
      className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-glass-border-medium bg-glass-dark px-3 text-sm font-medium text-text-primary backdrop-blur-md transition-all hover:bg-glass-light-hover focus-visible:outline-2 focus-visible:outline-accent-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-60', compact ? 'h-11 w-11 p-0' : 'px-5')}>
      {pending ? <LoaderCircle className="h-[19px] w-[19px] animate-spin" /> : <Heart className={cn('h-[19px] w-[19px]', saved && 'fill-accent-primary text-accent-hover')} />}
      {!compact && (saved ? 'Saved' : 'Save')}
    </button>
    {error && <p role="alert" className={cn('break-words text-xs text-trust-flagged', compact && 'absolute z-30 rounded-xl border border-border-subtle bg-surface-card p-3 shadow-lg', compact && (feedbackPosition === 'container' ? 'inset-x-4 bottom-full mb-3' : 'right-0 top-12 w-48'))}>{error}</p>}
  </div>
}

'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

type Props = { listingId: string; title: string; compact?: boolean; feedbackPosition?: 'button' | 'container' }

export function ShareListingButton({ listingId, title, compact = false, feedbackPosition = 'button' }: Props) {
  const [status, setStatus] = useState<string | null>(null)
  async function share(): Promise<void> {
    const url = `${window.location.origin}/marketplace/listing/${encodeURIComponent(listingId)}`
    try {
      if (navigator.share) await navigator.share({ title, url })
      else { await navigator.clipboard.writeText(url); setStatus('Link copied') }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatus('Could not share. Copy this page’s address to share it.')
    }
  }
  return <div className={compact && feedbackPosition === 'container' ? 'static' : 'relative'}>
    <button type="button" aria-label="Share listing" onClick={() => { void share() }} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border-subtle px-3 text-sm font-medium text-text-primary transition-all hover:bg-glass-light active:scale-95 focus-visible:outline-2 focus-visible:outline-accent-primary ${compact ? 'h-11 w-11 p-0' : 'px-5'}`}>
      {status === 'Link copied' ? <Check className="h-[19px] w-[19px]" /> : <Share2 className="h-[19px] w-[19px]" />}{!compact && 'Share'}
    </button>
    {status && <p role="status" className={`absolute z-30 break-words rounded-xl border border-border-subtle bg-surface-card p-3 text-xs text-text-secondary shadow-lg ${compact && feedbackPosition === 'container' ? 'inset-x-4 bottom-full mb-3' : 'right-0 top-12 w-48'}`}>{status}</p>}
  </div>
}

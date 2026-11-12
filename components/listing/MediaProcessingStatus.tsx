'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { retryListingMedia } from '@/app/actions/media'
import type { MediaSummary } from '@/lib/media/status'

const labels: Record<string, string> = {
  queued: 'Video queued', submitting: 'Sending video', uncertain: 'Awaiting video confirmation',
  processing: 'Processing video', ready: 'Video ready', errored: 'Video needs review',
}

export function MediaProcessingStatus({ listingId, media }: { listingId: string; media: MediaSummary }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const canRetry = media.status === 'queued' && media.attempts < 5
  const retry = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await retryListingMedia(listingId)
      if (!result.success) setError(result.error)
      router.refresh()
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setPending(false)
    }
  }
  return <div className="mt-2 border-t border-border-subtle pt-2 text-xs text-text-secondary">
    <div className="flex items-center justify-between gap-2 min-w-0 flex-wrap">
      <span role="status">{labels[media.status] ?? 'Video unavailable'}</span>
      {media.status !== 'ready' && <button
        type="button" disabled={pending}
        aria-label={canRetry ? 'Retry video processing' : 'Refresh video status'}
        title={canRetry ? 'Retry video processing' : 'Refresh video status'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-glass-light disabled:opacity-50 min-h-11 max-w-full whitespace-normal break-words"
        onClick={() => canRetry ? void retry() : router.refresh()}
      ><RefreshCw className={pending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></button>}
    </div>
    {(media.status === 'errored' || (media.status === 'queued' && media.attempts >= 5)) &&
      <p className="mt-1 text-text-muted">Processing needs a manual review.</p>}
    {error && <p role="alert" className="mt-1 break-words text-trust-flagged">{error}</p>}
  </div>
}

'use client'

import MuxPlayer from '@mux/mux-player-react'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { z } from 'zod'
import { AssetPhoto } from './AssetPhoto'

const playbackSchema = z.object({
  playbackId: z.string().min(1),
  tokens: z.object({ playback: z.string().min(1), thumbnail: z.string().min(1), storyboard: z.string().min(1) }),
})

type Props = {
  listingId: string; useMux: boolean; src: string | null; poster?: string | null;
  className?: string; photoFit?: 'cover' | 'contain'; autoPlay?: boolean; muted?: boolean; controls?: boolean; loop?: boolean; playsInline?: boolean;
}

function VideoError({ retry }: { retry: () => void }) {
  return <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background-app px-4 text-center text-sm text-text-secondary">
    <p role="status">Video unavailable</p>
    <button type="button" title="Retry video" aria-label="Retry video"
      className="flex h-10 w-10 items-center justify-center rounded-lg bg-glass-light hover:bg-glass-light-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary min-h-11 max-w-full whitespace-normal break-words"
      onClick={event => { event.stopPropagation(); retry() }}>
      <RefreshCw className="h-4 w-4" />
    </button>
  </div>
}

function MuxListingVideo({ listingId, className, autoPlay, muted, loop }: Props) {
  const [playback, setPlayback] = useState<z.infer<typeof playbackSchema> | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    let current = true
    void fetch(`/api/listings/${encodeURIComponent(listingId)}/playback`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('unavailable')
        const data = playbackSchema.parse(await response.json())
        if (current) { setPlayback(data); setError(false) }
      })
      .catch(() => { if (current) setError(true) })
      .finally(() => clearTimeout(timeout))
    // Renew before the 15-minute token expiry, including long-lived feed tabs.
    const renew = setTimeout(() => setAttempt(value => value + 1), 12 * 60 * 1000)
    return () => { current = false; controller.abort(); clearTimeout(timeout); clearTimeout(renew) }
  }, [listingId, attempt])

  if (error) return <VideoError retry={() => { setPlayback(null); setError(false); setAttempt(value => value + 1) }} />
  if (!playback) return <div role="status" className="flex h-full w-full items-center justify-center bg-background-app text-sm text-text-muted">Loading video...</div>
  return <MuxPlayer
    className={className} playbackId={playback.playbackId} tokens={playback.tokens}
    streamType="on-demand" autoPlay={autoPlay ? 'muted' : false} muted={muted} loop={loop} playsInline
    onError={() => setError(true)}
  />
}

function StorageListingVideo(props: Props) {
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (error || !props.src) return <VideoError retry={() => { setError(false); setAttempt(value => value + 1) }} />
  return <video key={attempt} src={props.src} poster={props.poster ?? undefined} className={props.className}
    autoPlay={props.autoPlay} muted={props.muted} controls={props.controls} loop={props.loop} playsInline preload="metadata"
    onError={() => setError(true)} />
}

export function ListingVideo(props: Props) {
  if (!props.useMux && !props.src && props.poster) return <AssetPhoto src={props.poster} alt="Listing photo" sizes="(min-width:1024px) 720px,100vw" fit={props.photoFit ?? 'cover'} />
  if (props.useMux) return <MuxListingVideo key={props.listingId} {...props} />
  return <StorageListingVideo key={`${props.listingId}:${props.src}`} {...props} />
}

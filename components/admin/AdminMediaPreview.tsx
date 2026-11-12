'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Images, RefreshCw } from 'lucide-react'
import { adminListingMediaSchema } from '@/lib/contracts/admin-media'
import { listingRequest } from '@/lib/listings/capture-client'

type Media = { kind: 'image' | 'video'; url: string; expiresAt: string }
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'

/** Private evidence is requested only when the reviewer explicitly opens it. */
export function AdminMediaPreview({ actorId, listingId, title, disabled }: { actorId: string; listingId: string; title: string; disabled: boolean }) {
  const [items, setItems] = useState<Media[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function load(): Promise<void> {
    if (busy || disabled) return
    setBusy(true); setError('')
    try {
      const result = await listingRequest(actorId, '/api/v1/admin/listings/' + listingId + '/media', adminListingMediaSchema)
      const media = result.items.map(item => {
        const url = new URL(item.url, window.location.origin)
        if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/files/listings-media/') || url.username || url.password || Date.parse(item.expiresAt) <= Date.now()) throw new Error('The media preview could not be verified. Refresh and try again.')
        return { ...item, url: url.pathname + url.search }
      })
      if (active.current) setItems(media)
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : 'The media preview could not be loaded.') }
    finally { if (active.current) setBusy(false) }
  }
  return <section className="mt-4 min-w-0 space-y-3" aria-label="Listing media preview">
    <button type="button" className={button} disabled={disabled || busy} onClick={() => { void load() }}>{busy ? <RefreshCw className="size-4 animate-spin" /> : <Images className="size-4" />}{busy ? 'Preparing previews...' : items ? 'Refresh media previews' : 'Preview listing media'}</button>
    {error && <p role="alert" className="break-words text-sm leading-6 text-text-secondary">{error}</p>}
    {items && !items.length && <p className="text-sm leading-6 text-text-muted">No available photo or video could be prepared for this listing.</p>}
    {items && items.length > 0 && <><p className="text-xs leading-5 text-text-muted">Private previews expire shortly. Refresh them if playback or an image stops loading. Gallery media does not establish a recorded location.</p><div className="grid min-w-0 gap-3 sm:grid-cols-2">{items.map((item, index) => <figure key={index} className="min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-background-app">
      {item.kind === 'image' ? <Image unoptimized src={item.url} width={640} height={480} className="aspect-[4/3] w-full object-contain" alt={'Listing photo ' + (index + 1) + ': ' + title} onError={() => setError('A preview could not be loaded. Refresh media previews to get a new private link.')} /> : <video className="aspect-[4/3] w-full" src={item.url} controls playsInline preload="none" onError={() => setError('The video could not be loaded. Refresh media previews to get a new private link.')} />}
      <figcaption className="p-3 text-xs text-text-muted">{item.kind === 'image' ? 'Photo' : 'Video'} {index + 1}</figcaption>
    </figure>)}</div></>}
  </section>
}

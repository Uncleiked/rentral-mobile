'use client'

import { useState } from 'react'
import { AssetPhoto } from './AssetPhoto'
import { PhotoViewer } from './PhotoViewer'

export function ListingGallery({ photos, title }: { photos: string[]; title: string }) {
  const [selected, setSelected] = useState(0), [fullPhoto, setFullPhoto] = useState(false)
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false)
  const index = Math.min(selected, photos.length - 1), current = photos[index]
  if (!current) return null
  const control = 'inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl border border-border-subtle px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary'
  return <section aria-label="Listing photos" className="min-w-0 space-y-3">
    <div className="relative aspect-[4/3] min-w-0 max-w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-card text-text-primary">
      <AssetPhoto key={current + ':' + attempt} src={current} alt={title + ' - photo ' + (index + 1)} sizes="(min-width:1024px) 720px,100vw" fit={fullPhoto ? 'contain' : 'cover'} onError={() => setFailed(true)} />
    </div>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="text-xs text-text-muted" aria-live="polite">Photo {index + 1} of {photos.length}</p><div className="flex flex-wrap gap-2"><button type="button" className={control} aria-pressed={fullPhoto} onClick={() => setFullPhoto(value => !value)}>{fullPhoto ? 'Fill photo frame' : 'Show full photo'}</button><PhotoViewer photos={photos} title={title} initialIndex={index} /></div></div>
    {failed && <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-text-muted">This photo could not load.<button type="button" className={control} onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>Retry photo</button></p>}
    {photos.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Choose a listing photo">{photos.map((_, photoIndex) => <button type="button" key={photoIndex} aria-pressed={index === photoIndex} onClick={() => { setSelected(photoIndex); setFailed(false) }} className={control + (index === photoIndex ? ' border-accent-primary bg-accent-muted text-accent-hover' : '')}>Photo {photoIndex + 1}</button>)}</div>}
  </section>
}

'use client'

import Image from 'next/image'
import { useState } from 'react'

export function ListingGallery({ photos, title }: { photos: string[]; title: string }) {
  const [selected, setSelected] = useState(0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const current = photos[selected] ?? photos[0]
  if (!current) return null
  return <section aria-label="Listing photos" className="mt-5 min-w-0 space-y-3">
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
      {failed ? <div className="flex h-full items-center justify-center p-5 text-center"><div><p role="status" className="text-sm text-text-muted">This photo could not load.</p><button type="button" className="mt-3 min-h-11 rounded-xl border border-border-subtle px-4 text-sm" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>Retry photo</button></div></div>
        : <Image key={`${selected}:${attempt}`} src={current} alt={`${title} — photo ${selected + 1}`} fill unoptimized sizes="(min-width:1024px) 720px,100vw" className="object-contain" onError={() => setFailed(true)} />}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Choose a listing photo">{photos.map((_, index) => <button type="button" key={index} aria-pressed={selected === index} onClick={() => { setSelected(index); setFailed(false) }} className={`min-h-11 rounded-xl border px-4 text-xs ${selected === index ? 'border-accent-primary bg-accent-muted text-accent-hover' : 'border-border-subtle text-text-secondary'}`}>Photo {index + 1}</button>)}</div>
  </section>
}

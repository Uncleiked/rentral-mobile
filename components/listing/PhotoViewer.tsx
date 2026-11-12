'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Expand, X } from 'lucide-react'
import { AssetPhoto } from './AssetPhoto'

const control = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-xs font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-40'

export function PhotoViewer({ photos, title, initialIndex = 0 }: { photos: string[]; title: string; initialIndex?: number }) {
  const [open, setOpen] = useState(false), [index, setIndex] = useState(initialIndex)
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const selected = Math.min(index, photos.length - 1), photo = photos[selected]
  useEffect(() => {
    const element = dialog.current
    if (!open || !element) return
    const previousOverflow = document.body.style.overflow, triggerElement = trigger.current
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { element.close(); document.body.style.overflow = previousOverflow; triggerElement?.focus() }
  }, [open])
  if (!photos.length) return null
  function close(): void { setOpen(false) }
  return <><button ref={trigger} type="button" className={control} onClick={() => { setIndex(initialIndex); setOpen(true) }} aria-haspopup="dialog"><Expand className="size-4 shrink-0" aria-hidden="true" />Open full photo</button>
    {open && <dialog ref={dialog} aria-labelledby={titleId} className="fixed inset-0 m-auto h-[min(90dvh,900px)] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-border-subtle bg-background-app p-0 text-text-primary backdrop:bg-glass-dark"
      onCancel={event => { event.preventDefault(); close() }} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) close() }}
      onKeyDown={event => { if (event.key === 'ArrowRight' && selected < photos.length - 1) { event.preventDefault(); setIndex(selected + 1) } else if (event.key === 'ArrowLeft' && selected > 0) { event.preventDefault(); setIndex(selected - 1) } }}>
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-3 sm:p-5"><header className="flex min-w-0 shrink-0 items-start justify-between gap-3"><div className="min-w-0"><h2 id={titleId} className="break-words text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-text-muted" aria-live="polite">Photo {selected + 1} of {photos.length} - Complete image</p></div><button type="button" className={control + ' shrink-0'} onClick={close} aria-label="Close full photo"><X className="size-5" aria-hidden="true" /></button></header>
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-surface-card"><AssetPhoto src={photo} alt={title + ' - full photo ' + (selected + 1)} sizes="(min-width:1280px) 1120px,100vw" fit="contain" original /></div>
        {photos.length > 1 && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2"><button type="button" className={control} disabled={selected === 0} onClick={() => setIndex(selected - 1)}><ArrowLeft className="size-4" aria-hidden="true" />Previous</button><button type="button" className={control} disabled={selected === photos.length - 1} onClick={() => setIndex(selected + 1)}>Next<ArrowRight className="size-4" aria-hidden="true" /></button></footer>}
      </div>
    </dialog>}
  </>
}

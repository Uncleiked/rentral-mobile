'use client'

import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { isProtectedListingImage, protectedListingImageLoader } from '@/lib/media/image-loader'

type Props = { src: string; alt: string; sizes: string; fit?: 'cover' | 'contain'; imageClassName?: string; original?: boolean; onError?: () => void }

function Photo({ src, alt, sizes, fit = 'cover', imageClassName = '', original = false, onError }: Props) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="absolute inset-0 flex min-h-0 flex-col items-center justify-center gap-2 bg-background-app p-3 text-center text-text-muted" role="img" aria-label={alt + ': image unavailable'}><ImageOff className="size-6 shrink-0" aria-hidden="true" /><span className="text-xs">Photo unavailable</span></div>
  // Same-origin listing variants retain browser authentication. Other private
  // capabilities and local preview blobs must never enter a public optimizer.
  const protectedVariant = !original && isProtectedListingImage(src)
  return <Image src={src} alt={alt} fill unoptimized={!protectedVariant} loader={protectedVariant ? protectedListingImageLoader : undefined} sizes={sizes} decoding="async" loading="lazy"
    className={(fit === 'contain' ? 'object-contain object-center ' : 'object-cover object-center ') + imageClassName}
    onError={() => { setFailed(true); onError?.() }} />
}

/** Render inside a bounded relative frame; changing source resets error state. */
export function AssetPhoto(props: Props) { return <Photo key={props.src} {...props} /> }

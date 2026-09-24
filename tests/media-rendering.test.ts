import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@mux/mux-player-react', () => ({ default: () => null }))

import { ListingVideo } from '@/components/listing/ListingVideo'
import { ListingCard } from '@/components/profile/ListingCard'

describe('protected media rendering', () => {
  it('renders native playback with the protected source and thumbnail routes', () => {
    const markup = renderToStaticMarkup(createElement(ListingVideo, {
      listingId: 'listing', useMux: false, src: '/api/listings/listing/source?kind=video',
      poster: '/api/listings/listing/source?kind=poster', controls: true,
    }))
    expect(markup).toContain('src="/api/listings/listing/source?kind=video"')
    expect(markup).toContain('poster="/api/listings/listing/source?kind=poster"')
    expect(markup).toContain('controls=""')
    expect(markup).not.toContain('/storage/v1/object/public/')
  })
  it('provides an accessible retry state instead of an empty video when no source exists', () => {
    const markup = renderToStaticMarkup(createElement(ListingVideo, { listingId: 'listing', useMux: false, src: null }))
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Video unavailable')
    expect(markup).toContain('aria-label="Retry video"')
    expect(markup).not.toContain('<video')
  })
  it('never renders a raw fallback while waiting for Mux authorization', () => {
    const markup = renderToStaticMarkup(createElement(ListingVideo, {
      listingId: 'listing', useMux: true, src: '/must-not-render.mp4',
    }))
    expect(markup).toContain('Loading video...')
    expect(markup).not.toContain('must-not-render')
  })
  it('keeps protected posters out of the shared Next image optimizer', () => {
    const markup = renderToStaticMarkup(createElement(ListingCard, { listing: {
      id: 'listing', title: 'House', price: '100', priceDenomination: 'year',
      posterUrl: '/api/listings/listing/source?kind=poster', videoUrl: null,
      useMux: false, media: null, badges: [], status: 'draft',
    } }))
    expect(markup).toContain('src="/api/listings/listing/source?kind=poster"')
    expect(markup).not.toContain('/_next/image')
  })
})

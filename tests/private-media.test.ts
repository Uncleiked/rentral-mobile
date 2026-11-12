import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), sign: vi.fn(), bucket: vi.fn(), variant: vi.fn() }))
vi.mock('@/lib/media/private-image', () => ({ privateImageVariant: mocks.variant }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.user }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.find } } }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: mocks.bucket } }) }))

import { GET } from '@/app/api/listings/[id]/source/route'
import { listingMediaUrl } from '@/lib/storage'
import { authRedirect } from '@/lib/auth-policy'
import { activeAccountWhere } from '@/lib/accounts/availability'

const id = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
const listing = { lister_id: 'owner', video_path: 'owner/folder/123_video.mp4', poster_path: 'owner/folder/123_poster.jpg' }
const get = (kind = 'video', listingId = id) => {
  const url = new URL(listingMediaUrl(listingId, 'video'), 'https://rentral.test')
  url.searchParams.set('kind', kind)
  return GET(new Request(url), { params: Promise.resolve({ id: listingId }) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MUX_ENABLED', 'false')
  mocks.user.mockResolvedValue('owner')
  mocks.find.mockResolvedValue(listing)
  mocks.bucket.mockReturnValue({ createSignedUrl: mocks.sign })
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed' }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('private listing previews', () => {
  it('uses same-origin references without object paths or tokens', () => {
    expect(listingMediaUrl(id, 'poster')).toBe(`/api/listings/${id}/source?kind=poster`)
  })
  it('lets only the exact source route handle its own authentication', () => {
    expect(authRedirect(`/api/listings/${id}/source`, null)).toBeNull()
    expect(authRedirect(`/api/listings/${id}/source/extra`, null)).toBe('/sign-in')
  })
  it('rejects anonymous requests before touching Storage or the database', async () => {
    mocks.user.mockResolvedValue(null)
    const response = await get()
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it.each(['document', '', 'VIDEO', '../video'])('rejects unsupported media kind %s', async kind => {
    expect((await get(kind)).status).toBe(404)
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('rejects invalid IDs', async () => {
    expect((await get('video', 'invalid')).status).toBe(404)
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('scopes every lookup to the owner or active inventory', async () => {
    await get()
    expect(mocks.find).toHaveBeenCalledWith({
      where: { id, lister: { is: activeAccountWhere }, OR: [{ lister_id: 'owner' }, { listing_status: 'active' }] },
      select: { lister_id: true, video_path: true, poster_path: true, media_source: true, gallery_media: true, gallery_permission_revision: true,
        lister: { select: { gallery_upload_allowed: true, gallery_permission_revision: true } } },
    })
  })
  it('does not distinguish inaccessible listings from missing listings', async () => {
    mocks.find.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it.each(['other/folder/video.mp4', 'owner/../video.mp4', 'owner/folder/deed.pdf', 'owner/folder/%2e%2e.mp4', 'https://evil.test/video.mp4', null])('never signs an unsafe or missing database path: %s', async path => {
    mocks.find.mockResolvedValue({ ...listing, video_path: path })
    expect((await get()).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('rejects video masquerading as a poster', async () => {
    mocks.find.mockResolvedValue({ ...listing, poster_path: listing.video_path })
    expect((await get('poster')).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it.each(['video', 'poster'] as const)('signs the persisted %s for five minutes without caching the redirect', async kind => {
    const response = await get(kind)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://storage.example.test/signed')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.bucket).toHaveBeenCalledWith('listings-media')
    expect(mocks.sign).toHaveBeenCalledWith(kind === 'video' ? listing.video_path : listing.poster_path, 300)
  })
  it('keeps owner draft previews available when Mux is enabled', async () => {
    vi.stubEnv('MUX_ENABLED', 'true')
    expect((await get()).status).toBe(307)
  })
  it('keeps authenticated active playback compatible while Mux is disabled', async () => {
    mocks.user.mockResolvedValue('viewer')
    expect((await get()).status).toBe(307)
  })
  it('denies original video to non-owners once Mux is enabled', async () => {
    mocks.user.mockResolvedValue('viewer')
    vi.stubEnv('MUX_ENABLED', 'true')
    expect((await get()).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
    expect((await get('poster')).status).toBe(307)
  })
  it.each([{ data: null, error: { message: 'sensitive provider error' } }, { data: {}, error: null }])('fails closed on Storage errors: %j', async result => {
    mocks.sign.mockResolvedValue(result)
    const response = await get()
    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.text()).not.toContain('sensitive')
  })
  it('handles database failures without leaking connection details', async () => {
    mocks.find.mockRejectedValue(new Error('database credentials'))
    const response = await get()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('credentials')
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})

describe('private responsive image authorization',()=>{
 const request=(kind:string,width:string)=>GET(new Request('https://rentral.test/api/listings/'+id+'/source?kind='+kind+'&w='+width),{params:Promise.resolve({id})})
 it('authorizes the listing before deriving a no-store sameorigin image',async()=>{mocks.variant.mockResolvedValue(Buffer.from('fixture-webp'));const response=await request('poster','640');expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('image/webp');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toContain('Cookie');expect(mocks.variant).toHaveBeenCalledWith(expect.any(Object),listing.poster_path,640);expect(mocks.sign).not.toHaveBeenCalled()})
 it('never derives inaccessible or unsafe media',async()=>{mocks.find.mockResolvedValue(null);expect((await request('poster','320')).status).toBe(404);expect(mocks.variant).not.toHaveBeenCalled();mocks.user.mockResolvedValue(null);expect((await request('poster','320')).status).toBe(401);expect(mocks.variant).not.toHaveBeenCalled()})
 it.each([['video','320'],['poster','1'],['poster','999999'],['poster','0320']])('rejects invalid image transform %s/%s before database lookup',async(kind,width)=>{expect((await request(kind,width)).status).toBe(400);expect(mocks.find).not.toHaveBeenCalled();expect(mocks.variant).not.toHaveBeenCalled()})
})

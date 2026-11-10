import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { verifyGalleryReferences } from '@/lib/backup/gallery'
const item = (name: string) => { const path = `owner/gallery/${name}.jpg`; return { kind: 'image', path, objectId: createHash('sha256').update(`listings-media\0${path}`).digest('hex'), digest: 'a'.repeat(64), sizeBytes: 100, contentType: 'image/jpeg' } }
const proof = [item('primary'), item('extra')]
const listing = { media_source: 'approved_gallery', listing_status: 'active', lister_id: 'owner', gallery_permission_revision: 2, gallery_media: proof, gallery_media_paths: proof.map(item => item.path), poster_path: proof[0].path, video_path: null }
const info = { digest: 'a'.repeat(64), size: 100, contentType: 'image/jpeg', createdAt: '2030-01-01T00:00:00.000Z' }
const claim = (id: string) => { const item = proof.find(item => item.objectId === id)!; return Promise.resolve({ owner_id: 'owner', bucket: 'listings-media', path: item.path, state: 'available', digest: item.digest, size_bytes: 100, content_type: 'image/jpeg' }) }
it('verifies every gallery photo including the extra image that is neither poster nor video', async () => {
  const file = vi.fn().mockResolvedValue(info)
  await verifyGalleryReferences(listing, file, claim)
  expect(file.mock.calls).toEqual(proof.map(item => [item.path, 'owner']))
})
it('rejects a missing or changed secondary gallery image and a missing durable claim', async () => {
  await expect(verifyGalleryReferences(listing, async path => { if (path === proof[1].path) throw new Error('Missing secondary image'); return info }, claim)).rejects.toThrow('Missing secondary image')
  await expect(verifyGalleryReferences(listing, async path => path === proof[1].path ? { ...info, digest: 'b'.repeat(64) } : info, claim)).rejects.toMatchObject({ code: 'GALLERY_CLAIM_DIGEST_MISMATCH' })
  await expect(verifyGalleryReferences(listing, async () => info, async () => null)).rejects.toMatchObject({ code: 'GALLERY_CLAIM_DIGEST_MISMATCH' })
})

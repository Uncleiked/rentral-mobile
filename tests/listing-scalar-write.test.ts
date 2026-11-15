import type { Prisma } from '@prisma/client'
import { beforeEach, expect, it, vi } from 'vitest'
const ready = vi.hoisted(() => vi.fn())
vi.mock('@/lib/database/readiness', () => ({ assertMongoReady: ready }))
import { writeOwnedListingScalars } from '@/lib/listings/scalar-write'
const command = vi.fn(), tx = { $runCommandRaw: command } as unknown as Prisma.TransactionClient
beforeEach(() => { vi.resetAllMocks(); ready.mockResolvedValue(undefined); command.mockResolvedValue({ ok: 1, n: 1, nModified: 1 }) })
it('scopes an existing draft update to its owner and never creates a missing listing', async () => {
  await writeOwnedListingScalars(tx, 'listing', 'owner', { text_address: '$ROOT', gallery_permission_revision: 3 }, true)
  expect(command).toHaveBeenCalledOnce()
  const input = command.mock.calls[0][0]
  expect(input.update).toBe('Listing'); expect(input.updates[0]).toMatchObject({ q: { _id: 'listing', lister_id: 'owner', listing_status: 'draft' }, multi: false, upsert: false })
  expect(input.updates[0].u[0].$set).toMatchObject({ text_address: { $literal: '$ROOT' }, gallery_permission_revision: { $literal: { $numberLong: '3' } }, updatedAt: '$$NOW' })
})
it('rejects identity, revision, relation changes and Mongo operators before any command', async () => {
  for (const patch of [{ id: 'another' }, { _id: 'another' }, { lister_id: 'another' }, { revision: 10 }, { lister: { connect: { id: 'another' } } }, { $set: { listing_status: 'active' } }, { capture_id: 'new-capture' }, { capture_id: null }]) await expect(writeOwnedListingScalars(tx, 'listing', 'owner', patch)).rejects.toThrow()
  expect(command).not.toHaveBeenCalled()
})
it('allows only an explicit gallery clear of an old recording reference', async () => {
  await writeOwnedListingScalars(tx, 'listing', 'owner', { capture_id: null, media_source: 'approved_gallery' })
  expect(command.mock.calls[0][0].updates[0].u[0].$set.capture_id).toEqual({ $literal: null })
})
it('encodes JSON keys as literal data instead of Extended JSON or Mongo expressions', async () => {
  await writeOwnedListingScalars(tx, 'listing', 'owner', { asset_metadata: JSON.parse('{"$date":"2030-01-01","__proto__":{"polluted":true},"a.b":[{"$numberLong":"12"},"$ROOT"]}') })
  const expression = command.mock.calls[0][0].updates[0].u[0].$set.asset_metadata
  expect(expression.$arrayToObject).toHaveLength(1)
  expect(expression.$arrayToObject[0]).toEqual(expect.arrayContaining([[{ $literal: '$date' }, { $literal: '2030-01-01' }]]))
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})
it.each([{ ok: 0, n: 1, nModified: 1 }, { ok: 1, n: 0, nModified: 0 }, { ok: 1, n: 2, nModified: 2 }, { ok: 1, n: 1, nModified: 1, writeErrors: [{}] }, { ok: 1, n: 1, nModified: 1, writeConcernError: {} }])('refuses an unconfirmed scalar update %j', async result => {
  command.mockResolvedValue(result)
  await expect(writeOwnedListingScalars(tx, 'listing', 'owner', { listing_status: 'active' })).rejects.toThrow('LISTING_WRITE_UNCONFIRMED')
})
it('does not issue writes before database preparation is confirmed', async () => {
  ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED'))
  await expect(writeOwnedListingScalars(tx, 'listing', 'owner', { listing_status: 'active' })).rejects.toThrow('DATABASE_SETUP_REQUIRED'); expect(command).not.toHaveBeenCalled()
})

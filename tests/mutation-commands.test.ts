import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { mutationReceipt: { findUnique: mocks.find } } }))
import { committedMutation, mutationCommand, MutationConflictError } from '@/lib/database/mutations'

const clientId = 'a727d7b3-2148-43e4-86df-a0717569fec4'
beforeEach(() => vi.resetAllMocks())
describe('actor-scoped durable mutation identity', () => {
  it('normalizes object key order and UUID casing without changing the command', () => {
    expect(mutationCommand('actor', 'listing_draft_save', clientId, { clientId, metadata: { a: 1, b: [false, null] } }))
      .toEqual(mutationCommand('actor', 'listing_draft_save', clientId.toUpperCase(), { metadata: { b: [false, null], a: 1 }, clientId: clientId.toUpperCase() }))
  })
  it('never shares a key across actors or resource types', () => {
    const first = mutationCommand('actor', 'listing_draft_save', clientId, {})!
    expect(mutationCommand('other-actor', 'listing_draft_save', clientId, {})!.id).not.toBe(first.id)
    expect(mutationCommand('actor', 'booking_create', clientId, {})!.id).not.toBe(first.id)
    expect(mutationCommand('actor', 'listing_draft_save', clientId, { changed: true })!.id).toBe(first.id)
    expect(mutationCommand('actor', 'listing_draft_save', clientId, { changed: true })!.input_hash).not.toBe(first.input_hash)
  })
  it('rejects non-JSON command values and returns no receipt for legacy calls', async () => {
    expect(() => mutationCommand('actor', 'booking_create', clientId, { amount: BigInt(1) })).toThrow('JSON values')
    expect(await committedMutation(null)).toBeNull()
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('resolves only an identical committed command and rejects changed instructions', async () => {
    const command = mutationCommand('actor', 'listing_submit', clientId, { value: 1 })!
    mocks.find.mockResolvedValue({ ...command, resource_id: 'owned-resource' })
    expect(await committedMutation(command)).toBe('owned-resource')
    await expect(committedMutation(mutationCommand('actor', 'listing_submit', clientId, { value: 2 }))).rejects.toBeInstanceOf(MutationConflictError)
  })
})

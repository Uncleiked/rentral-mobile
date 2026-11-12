import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), allowed: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { organizationApplication: { aggregateRaw: mocks.aggregate, findMany: mocks.findMany } } }))
vi.mock('@/lib/database/readiness', () => ({ assertOrganizationsReady: mocks.ready }))
vi.mock('@/lib/auth/roles', () => ({ hasStaffPermission: mocks.allowed, assertStaffPermission: vi.fn() }))
import { organizationQueue, searchOrganizationQueue } from '@/lib/organizations/service'
import { organizationQueueSearchSchema } from '@/lib/contracts/organizations'
import { organizationQueuePipeline, organizationQueueCursor } from '@/lib/organizations/queue'
const actor = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222', next = '33333333-3333-4333-8333-333333333333'
const date = new Date('2026-11-01T12:00:00Z')
const row = { id, user_id: actor, revision: 3, legal_name: 'Earlier Yaba Homes', registration_type: 'company', registration_number: 'RC-2026', representative_name: 'Synthetic Representative', representative_role: 'Director', document_kind: 'cac_certificate', supporting_kind: null, status: 'pending', review_reason: null, submitted_at: date, reviewed_at: null, document_path: 'private-owner/registration.pdf', document_proof: { digest: 'private' } }
beforeEach(() => {
  vi.resetAllMocks(); mocks.allowed.mockResolvedValue(true)
  mocks.aggregate.mockResolvedValue([{ items: [{ id, at: date.toISOString() }], total: [{ count: 1 }] }]); mocks.findMany.mockResolvedValue([row])
})
describe('organization queue discoverability and current authority', () => {
  it('keeps legacy no-query callers valid while prioritizing oldest pending work', async () => {
    expect((await organizationQueue(actor)).items).toHaveLength(1)
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { status: 'pending' }, orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }], take: 50 })
    expect(mocks.allowed).toHaveBeenCalledTimes(2)
  })
  it('filters pending before its page window so reviewed records cannot bury old requests', async () => {
    const page = await searchOrganizationQueue(actor, {})
    expect(page).toMatchObject({ total: 1, hasMore: false, nextCursor: null })
    expect(page.items[0]).toMatchObject({ legalName: row.legal_name, status: 'pending' })
    expect(JSON.stringify(page)).not.toContain('registration.pdf'); expect(JSON.stringify(page)).not.toContain('document_proof')
    const pipeline = mocks.aggregate.mock.calls[0][0].pipeline
    expect(pipeline[0]).toEqual({ $match: { status: 'pending' } })
    expect(pipeline.at(-1).$facet.items).toContainEqual({ $sort: { submitted_at: 1, _id: 1 } })
    expect(pipeline.at(-1).$facet.items).toContainEqual({ $limit: 26 })
    expect(mocks.aggregate).toHaveBeenCalledWith(expect.objectContaining({ options: { maxTimeMS: 10000 } }))
  })
  it('keeps search strings literal across company, registration and representative fields', () => {
    const pipeline = organizationQueuePipeline(organizationQueueSearchSchema.parse({ query: '$ne.*[RC]', status: 'all' }))
    const encoded = JSON.stringify(pipeline)
    expect(encoded).toContain('"$literal":"$ne.*[rc]"'); expect(encoded).not.toContain('$regex')
    for (const name of ['legal_name', 'registration_number', 'representative_name']) expect(encoded).toContain('$' + name)
    expect(pipeline[0]).toEqual({ $match: {} })
  })
  it('keeps totals separate from cursor windows and binds cursor to the filters', async () => {
    mocks.aggregate.mockResolvedValue([{ items: [{ id, at: date.toISOString() }, { id: next, at: date.toISOString() }], total: [{ count: 72 }] }])
    const page = await searchOrganizationQueue(actor, { limit: 1 })
    expect(page).toMatchObject({ total: 72, hasMore: true }); expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toEqual(expect.any(String))
    const input = organizationQueueSearchSchema.parse({ limit: 1, cursor: page.nextCursor })
    const pipeline = organizationQueuePipeline(input)
    expect(pipeline.at(-1)).toMatchObject({ $facet: { total: [{ $count: 'count' }] } })
    const serialized = JSON.stringify(pipeline)
    expect(serialized).toContain('$gt'); expect(serialized).toContain(id)
    expect(() => organizationQueuePipeline({ ...input, status: 'approved' })).toThrow('no longer matches')
    expect(() => organizationQueuePipeline({ ...input, query: 'different' })).toThrow('no longer matches')
    expect(() => organizationQueuePipeline({ ...input, sort: 'newest' })).toThrow('no longer matches')
  })
  it('rejects malformed and injected inputs before a database query', async () => {
    for (const input of [{ query: { $ne: '' } }, { status: 'deleted' }, { limit: 51 }, { ownerId: actor }, { query: 'x'.repeat(255) }]) await expect(searchOrganizationQueue(actor, input)).rejects.toThrow()
    expect(mocks.aggregate).not.toHaveBeenCalled()
    const input = organizationQueueSearchSchema.parse({ cursor: Buffer.from('{}').toString('base64url') })
    expect(() => organizationQueuePipeline(input)).toThrow('no longer matches')
  })
  it('does not accept any role that lacks organization review permission', async () => {
    mocks.allowed.mockResolvedValue(false)
    await expect(searchOrganizationQueue(actor, {})).rejects.toMatchObject({ status: 403 })
    expect(mocks.aggregate).not.toHaveBeenCalled()
  })
  it('rechecks role revocation before returning private application details', async () => {
    mocks.allowed.mockResolvedValueOnce(true).mockResolvedValue(false)
    await expect(searchOrganizationQueue(actor, {})).rejects.toMatchObject({ status: 403 })
  })
  it('handles empty results and restores aggregate ordering after hydration', async () => {
    mocks.aggregate.mockResolvedValueOnce([])
    expect(await searchOrganizationQueue(actor, {})).toEqual({ items: [], total: 0, hasMore: false, nextCursor: null })
    mocks.aggregate.mockResolvedValueOnce([{ items: [{ id: next, at: date.toISOString() }, { id, at: date.toISOString() }], total: [{ count: 2 }] }])
    mocks.findMany.mockResolvedValueOnce([row, { ...row, id: next }])
    expect((await searchOrganizationQueue(actor, {})).items.map(item => item.id)).toEqual([next, id])
  })
  it('creates an opaque cursor only from a validated hit and stable query signature', () => {
    const cursor = organizationQueueCursor({ id, at: date.toISOString() }, organizationQueueSearchSchema.parse({ query: 'Yaba' }))
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(() => organizationQueuePipeline(organizationQueueSearchSchema.parse({ query: 'yaba', cursor }))).not.toThrow()
  })
})

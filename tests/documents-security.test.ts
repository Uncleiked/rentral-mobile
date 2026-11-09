import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({ listing: vi.fn(), transaction: vi.fn(), lock: vi.fn(), current: vi.fn(), review: vi.fn(), upsert: vi.fn(), info: vi.fn(), download: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findUniqueOrThrow: mocks.listing }, $transaction: mocks.transaction } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.lock(model, id); return true } }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ info: mocks.info, download: mocks.download }) } }) }))
import { analyzeListingDocument } from '@/lib/documents/analyze'

const listingId = 'listing-1', path = 'host/folder/title.pdf'
const pdf = '%PDF-1.4\nOwned test document', digest = createHash('sha256').update(pdf).digest('hex')
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('GEMINI_API_KEY', 'test-only-key'); vi.stubEnv('GEMINI_DOCUMENT_MODEL', 'configured-test-model')
  mocks.listing.mockResolvedValue({ document_path: path, lister_id: 'host' }); mocks.current.mockResolvedValue({ document_path: path })
  mocks.info.mockResolvedValue({ data: { size: Buffer.byteLength(pdf), contentType: 'application/pdf', digest }, error: null })
  mocks.download.mockResolvedValue({ data: new Blob([pdf], { type: 'application/pdf' }), error: null })
  mocks.review.mockResolvedValue(null)
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    listing: { findUnique: mocks.current }, documentReview: { findUnique: mocks.review, upsert: mocks.upsert } }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ risk: 'low', findings: [], documentType: 'Title document' }) }] } }] })))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('document screening is advisory and private', () => {
  it('is unavailable without explicit model/key before touching private storage or database', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('AI_UNAVAILABLE')
    expect(mocks.listing).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled()
  })
  it('checks owner paths and metadata MIME/size before downloading', async () => {
    mocks.listing.mockResolvedValue({ document_path: 'other/folder/title.pdf', lister_id: 'host' })
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('INVALID_DOCUMENT'); expect(mocks.info).not.toHaveBeenCalled()
    mocks.listing.mockResolvedValue({ document_path: path, lister_id: 'host' }); mocks.info.mockResolvedValue({ data: { size: 11 * 1024 * 1024, contentType: 'application/pdf' }, error: null })
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('INVALID_DOCUMENT'); expect(mocks.download).not.toHaveBeenCalled()
  })
  it('keeps even low-risk AI results waiting for a human', async () => {
    await analyzeListingDocument(listingId)
    expect(mocks.lock).toHaveBeenCalledTimes(1)
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'needs_review', findings: expect.objectContaining({ source: 'gemini', risk: 'low' }) }), update: expect.objectContaining({ status: 'needs_review' }) }))
    const request = vi.mocked(fetch).mock.calls[0][1]!
    expect(request.redirect).toBe('error')
    expect(JSON.parse(String(request.body)).generationConfig).toMatchObject({ maxOutputTokens: 2048, responseMimeType: 'application/json' })
  })
  it.each([{ status: 'approved', reviewed_by: 'human' }, { status: 'rejected', reviewed_by: null }, { status: 'needs_review', reviewed_by: 'human' }])('cannot overwrite a delayed human decision %o', async existing => {
    mocks.review.mockResolvedValue(existing)
    await analyzeListingDocument(listingId)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects stale document-path responses and instruction-shaped AI approval', async () => {
    mocks.current.mockResolvedValue({ document_path: 'host/new-document.pdf' })
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('DOCUMENT_CHANGED'); expect(mocks.upsert).not.toHaveBeenCalled()
    mocks.current.mockResolvedValue({ document_path: path })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ risk: 'low', findings: [], documentType: 'Title', status: 'approved' }) }] } }] })))
    await expect(analyzeListingDocument(listingId)).rejects.toThrow(); expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('refuses mismatched sealed bytes before sending private data to the configured provider', async () => {
    mocks.info.mockResolvedValue({ data: { size: Buffer.byteLength(pdf), contentType: 'application/pdf', digest: 'a'.repeat(64) }, error: null })
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('DOCUMENT_UNAVAILABLE')
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION'])('never persists incomplete or blocked model output: %s', async finishReason => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ candidates: [{ finishReason, content: { parts: [{ text: '{"risk":"low","findings":[],"documentType":"Title"}' }] } }] }))
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('AI_UNAVAILABLE')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects oversized envelopes and excessive candidate arrays without retaining private provider text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('private provider text', { headers: { 'content-type': 'application/json', 'content-length': String(129 * 1024) } }))
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('AI_UNAVAILABLE')
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ candidates: Array.from({ length: 2 }, () => ({ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } })) }))
    await expect(analyzeListingDocument(listingId)).rejects.toThrow('AI_UNAVAILABLE')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

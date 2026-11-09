import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { matchingMoney, matchingNaira, createMatchingRequest } from '@/lib/matching/client'
const matchingRequest = createMatchingRequest('11111111-1111-4111-8111-111111111111')

afterEach(() => vi.unstubAllGlobals())
it('preserves exact kobo at the supported budget boundary in display and editable values', () => {
  expect(matchingNaira('9007199254740991')).toBe('90071992547409.91')
  expect(matchingMoney('9007199254740991')).toBe('₦90,071,992,547,409.91')
  expect(matchingNaira('1')).toBe('0.01')
})
it('never retries a mutation after a network failure or an invalid success envelope', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('private network diagnostics'))
  vi.stubGlobal('fetch', fetch)
  const schema = z.object({ id: z.uuid() }).strict()
  await expect(matchingRequest('squat-mates/connections', schema, { method: 'POST', body: { profileId: 'test' } })).rejects.toMatchObject({ code: 'NETWORK_UNCONFIRMED' })
  expect(fetch).toHaveBeenCalledOnce()
  fetch.mockResolvedValue(Response.json({ success: true, data: { id: 'not-a-verified-id' } }))
  await expect(matchingRequest('squat-mates/connections', schema, { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('validates successful response data and surfaces bounded server failures without hidden fields', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ success: false, code: 'NOT_FOUND', error: 'This contact is unavailable.' }, { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  await expect(matchingRequest('squat-mates/connections/example', z.object({ id: z.uuid() }))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
})

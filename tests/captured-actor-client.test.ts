import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createCommercialRequest } from '@/lib/commerce/client'
import { createMatchingRequest } from '@/lib/matching/client'

afterEach(() => vi.unstubAllGlobals())
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const schema = z.object({ saved: z.literal(true) }).strict()
it.each(['commerce', 'matching'])('keeps the captured %s actor restriction after ambient account changes and never replays the command', async kind => {
  let current = actor
  const fetch = vi.fn().mockImplementation(async (_url: unknown, input: RequestInit) => {
    if (new Headers(input.headers).get('X-Rentral-Account') !== current) return Response.json({ success: false, code: 'ACCOUNT_CHANGED', error: 'The signed-in account changed. Reload this page.' }, { status: 409 })
    return Response.json({ success: true, data: { saved: true } })
  })
  vi.stubGlobal('fetch', fetch)
  const commercial = createCommercialRequest(actor), matching = createMatchingRequest(actor)
  const submit = () => kind === 'commerce' ? commercial('commercial/orders', schema, 'POST', { clientId: actor, kind: 'insights' }) : matching('squat-mates/profile', schema, { method: 'PUT', body: { isVisible: true } })
  expect(await submit()).toEqual({ saved: true })
  current = other
  await expect(submit()).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1]).toMatchObject({ headers: expect.objectContaining({ 'X-Rentral-Account': actor }), credentials: 'same-origin', cache: 'no-store' })
})
it('fails closed without a captured account and does no fetch for anonymous sponsorship observations', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  await expect(createCommercialRequest(null)('sponsored/example/events', schema, 'POST', { event: 'impression' })).rejects.toMatchObject({ status: 401 })
  await expect(createMatchingRequest(null)('squat-mates/profile', schema, { method: 'PUT', body: {} })).rejects.toMatchObject({ status: 401 })
  expect(fetch).not.toHaveBeenCalled()
})

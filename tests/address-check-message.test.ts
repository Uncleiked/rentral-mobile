import { expect, it } from 'vitest'
import { captureAddressResultSchema } from '../lib/contracts/capture'
import { captureAddressMessage } from '../lib/listings/address-check-message'

it('does not tell users the provider is down when a completed lookup lacks a precise building', () => {
  for (const reason of ['no_result', 'low_confidence', 'imprecise'] as const) {
    expect(captureAddressMessage('unavailable', reason)).not.toMatch(/service.*unavailable|try again later/i)
    expect(captureAddressMessage('unavailable', reason)).toContain('Your draft is kept')
  }
  expect(captureAddressMessage('unavailable', 'provider_unavailable')).toContain('service is temporarily unavailable')
  expect(captureAddressMessage('unavailable')).not.toMatch(/service.*unavailable/i)
})

it('never accepts a lookup failure reason attached to a successful match', () => {
  const result = { captureId: '11111111-1111-4111-8111-111111111111', status: 'matched', addressHash: 'a'.repeat(64), toleranceMeters: 100 }
  expect(captureAddressResultSchema.safeParse(result).success).toBe(true)
  expect(captureAddressResultSchema.safeParse({ ...result, reason: 'no_result' }).success).toBe(false)
})

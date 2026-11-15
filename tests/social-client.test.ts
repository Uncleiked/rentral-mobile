import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { socialError, socialRequest, SocialRequestError } from '@/lib/social/client'

afterEach(() => vi.unstubAllGlobals())
it('keeps setup failures explicit without giving renters infrastructure instructions', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: false, error: 'MongoDB is not prepared. Run npm run db:setup.', code: 'DATABASE_SETUP_REQUIRED' }, { status: 503 })))
  const failure = await socialRequest('/api/v1/people', z.array(z.string())).catch(error => error)
  expect(failure).toBeInstanceOf(SocialRequestError)
  expect(failure.code).toBe('DATABASE_SETUP_REQUIRED')
  expect(socialError(failure)).toBe('Community features are being prepared. Please try again later.')
  expect(socialError(failure)).not.toMatch(/Mongo|npm|db:setup/)
})
it('preserves actionable account and retry failures instead of treating them as an empty directory', () => {
  expect(socialError(new SocialRequestError('The signed-in account changed. Refresh this page.', 409, 'ACCOUNT_CHANGED'))).toBe('The signed-in account changed. Refresh this page.')
  expect(socialError(new SocialRequestError('Check the saved request before another change.', 0, 'UNCONFIRMED'))).toBe('Check the saved request before another change.')
})


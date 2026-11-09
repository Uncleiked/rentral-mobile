import { describe, expect, it } from 'vitest'
import { authRedirect, safeAuthNext } from '@/lib/auth-policy'
import { PUBLIC_LISTING_STATUSES } from '@/lib/listing-status'

const verified = { app_metadata: { kyc_verified: true, username: 'renter', profile_completed: true } }

describe('auth route boundaries', () => {
  it.each(['/forgot-password', '/reset-password', '/sign-in', '/', '/api/webhooks/didit'])('allows %s without a session', path => {
    expect(authRedirect(path, null)).toBeNull()
  })
  it.each(['/marketplace', '/marketplace/listing/create', '/sign-in-evil', '/api/webhooks-evil', '/onboarding-evil'])('protects %s', path => {
    expect(authRedirect(path, null)).toBe('/sign-in')
  })
  it('allows signed-in accounts to enter directly and redirects legacy onboarding', () => {
    expect(authRedirect('/reset-password', { app_metadata: {} })).toBeNull()
    expect(authRedirect('/marketplace', { app_metadata: {} })).toBeNull()
    expect(authRedirect('/onboarding', verified)).toBe('/marketplace')
    expect(authRedirect('/onboarding', { app_metadata: {} })).toBe('/marketplace')
  })
  it('requires a real session without requiring identity or profile metadata', () => {
    expect(authRedirect('/marketplace', { app_metadata: { kyc_verified: false, profile_completed: false } })).toBeNull()
    expect(authRedirect('/marketplace', { is_anonymous: true })).toBe('/sign-in')
    expect(authRedirect('/marketplace', null)).toBe('/sign-in')
    expect(authRedirect('/api/verify', null)).toBeNull()
  })
})

describe('callback redirect validation', () => {
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil.example', 'javascript:alert(1)', null])('rejects %s', value => {
    expect(safeAuthNext(value, 'https://rentral.example').href).toBe('https://rentral.example/marketplace')
  })
  it('keeps local password recovery and email confirmation query parameters', () => {
    expect(safeAuthNext('/reset-password', 'https://rentral.example').pathname).toBe('/reset-password')
    expect(safeAuthNext('/marketplace/profile?email_change=check', 'https://rentral.example').search).toBe('?email_change=check')
  })
})

it('keeps drafts and unverified inventory out of public discovery', () => {
  expect(PUBLIC_LISTING_STATUSES).toEqual(['active'])
})

import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireSessionUserId: mocks.session }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.user } } }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error('REDIRECT:' + path) },
  notFound: () => { throw new Error('NOT_FOUND') },
}))
vi.mock('@/components/organizations/OrganizationApplicationForm', () => ({ OrganizationApplicationForm: () => null }))
import OrganizationPage from '@/app/onboarding/organization/page'
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue('existing-account') })
it('does not loop an unknown account type between marketplace and organization onboarding', async () => {
  mocks.user.mockResolvedValue({ account_type: 'unrecognized' })
  await expect(OrganizationPage()).rejects.toThrow('NOT_FOUND')
})
it.each(['individual', null])('returns a legitimate individual or legacy account %s to marketplace', async type => {
  mocks.user.mockResolvedValue({ account_type: type })
  await expect(OrganizationPage()).rejects.toThrow('REDIRECT:/marketplace')
})
it('returns an absent account to sign-in instead of a protected-route loop', async () => {
  mocks.user.mockResolvedValue(null)
  await expect(OrganizationPage()).rejects.toThrow('REDIRECT:/sign-in')
})
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), application: vi.fn(), ready: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.user }, organizationApplication: { findUnique: mocks.application } } }))
vi.mock('@/lib/database/readiness', () => ({ assertOrganizationsReady: mocks.ready }))
import { assertOrganizationMarketplaceAccess, organizationMarketplaceAllowed, organizationPageExempt } from '@/lib/organizations/access'
beforeEach(() => { vi.resetAllMocks(); mocks.ready.mockResolvedValue(undefined) })
it.each(['individual', null, undefined])('keeps an existing individual or unset legacy type %s admitted without new collections', async type => {
  mocks.user.mockResolvedValue({ account_type: type })
  expect(await organizationMarketplaceAllowed('account')).toBe(true)
  expect(mocks.ready).not.toHaveBeenCalled(); expect(mocks.application).not.toHaveBeenCalled()
})
it.each([null, { account_type: 'unrecognized' }])('does not grant marketplace access to an absent or unknown account %j', async account => {
  mocks.user.mockResolvedValue(account)
  expect(await organizationMarketplaceAllowed('account')).toBe(false)
  expect(mocks.application).not.toHaveBeenCalled()
})
it.each(['pending', 'changes_requested', 'rejected', null])('denies an organization with current application state %s', async status => {
  mocks.user.mockResolvedValue({ account_type: 'organization' }); mocks.application.mockResolvedValue(status ? { status } : null)
  await expect(assertOrganizationMarketplaceAccess('organization')).rejects.toMatchObject({ status: 403, code: 'ORGANIZATION_APPROVAL_REQUIRED' })
})
it('grants an organization only through current database approval', async () => {
  mocks.user.mockResolvedValue({ account_type: 'organization' }); mocks.application.mockResolvedValue({ status: 'approved' })
  expect(await organizationMarketplaceAllowed('organization')).toBe(true)
  expect(mocks.ready).toHaveBeenCalledOnce()
})
it('fails closed on unprepared organization collections without querying the missing collection', async () => {
  mocks.user.mockResolvedValue({ account_type: 'organization' }); mocks.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED'))
  await expect(organizationMarketplaceAllowed('organization')).rejects.toThrow('DATABASE_SETUP_REQUIRED')
  expect(mocks.application).not.toHaveBeenCalled()
})
it('limits staff, account and redress route exceptions to exact route boundaries', () => {
  for (const path of ['/onboarding/organization', '/marketplace/profile', '/marketplace/appeals', '/admin', '/marketplace/admin', '/marketplace/admin/finance', '/help']) expect(organizationPageExempt(path)).toBe(true)
  for (const path of ['/marketplace', '/marketplace/listing/create', '/marketplace/admin-pretend', '/administrator', '/marketplace/profile/someone']) expect(organizationPageExempt(path)).toBe(false)
})

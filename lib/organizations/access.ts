import prisma from '@/lib/db'
import { assertOrganizationsReady } from '@/lib/database/readiness'
import { ApiError } from '@/lib/api/http'

/** Null types are existing individual accounts; editable metadata is never consulted. */
export async function organizationMarketplaceAllowed(userId: string): Promise<boolean> {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { account_type: true } })
  if (!account) return false
  if (account.account_type == null || account.account_type === 'individual') return true
  if (account.account_type !== 'organization') return false
  await assertOrganizationsReady()
  const application = await prisma.organizationApplication.findUnique({ where: { user_id: userId }, select: { status: true } })
  return application?.status === 'approved'
}
export async function assertOrganizationMarketplaceAccess(userId: string): Promise<void> {
  if (!await organizationMarketplaceAllowed(userId)) throw new ApiError(403, 'ORGANIZATION_APPROVAL_REQUIRED', 'Complete organization registration and wait for administrator approval before entering the marketplace.')
}
export function organizationPageExempt(pathname: string): boolean {
  return pathname === '/' || pathname === '/insights' || pathname === '/onboarding/organization' || pathname === '/admin' || (pathname === '/marketplace/admin' || pathname.startsWith('/marketplace/admin/'))
    || pathname === '/marketplace/appeals' || pathname === '/marketplace/profile'
    || pathname === '/help' || pathname === '/privacy' || pathname === '/terms'
    || pathname === '/sign-in' || pathname === '/forgot-password' || pathname === '/reset-password'
    || pathname === '/confirm-email' || pathname.startsWith('/auth/') || pathname.startsWith('/api/')
}

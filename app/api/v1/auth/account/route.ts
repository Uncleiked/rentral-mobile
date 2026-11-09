import { apiSuccess } from '@/lib/api/http'
import { authFailure } from '@/lib/auth/api'
import { requireSecurityIdentity } from '@/lib/auth/security-api'
import { getAccountSecurity } from '@/lib/auth/account-security'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const identity = await requireSecurityIdentity(request); return apiSuccess(await getAccountSecurity(identity.userId)) }
  catch (error) { return authFailure(error) }
}

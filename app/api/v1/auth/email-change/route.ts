import { apiSuccess, readApiJson } from '@/lib/api/http'
import { authFailure } from '@/lib/auth/api'
import { requireSecurityIdentity } from '@/lib/auth/security-api'
import { cancelAccountEmailChange, requestAccountEmailChange } from '@/lib/auth/account-security'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try { const identity = await requireSecurityIdentity(request, true); return apiSuccess(await requestAccountEmailChange(identity.userId, await readApiJson(request)), 201) }
  catch (error) { return authFailure(error) }
}
export async function DELETE(request: Request): Promise<Response> {
  try { const identity = await requireSecurityIdentity(request, true); await cancelAccountEmailChange(identity.userId); return apiSuccess({ cancelled: true }) }
  catch (error) { return authFailure(error) }
}

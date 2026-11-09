import { apiSuccess, readApiJson } from '@/lib/api/http'
import { authFailure, authLimit } from '@/lib/auth/api'
import { confirmAccountEmailChange } from '@/lib/auth/account-security'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try { authLimit(request); return apiSuccess(await confirmAccountEmailChange(await readApiJson(request))) }
  catch (error) { return authFailure(error) }
}

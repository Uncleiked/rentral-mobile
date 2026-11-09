import { apiSuccess, readApiJson } from '@/lib/api/http'
import { registerAccount } from '@/lib/auth/service'
import { authFailure, authLimit } from '@/lib/auth/api'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try { authLimit(request); return apiSuccess(await registerAccount(await readApiJson(request)), 201) }
  catch (error) { return authFailure(error) }
}

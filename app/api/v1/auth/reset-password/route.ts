import { apiSuccess, readApiJson } from '@/lib/api/http'
import { resetPassword } from '@/lib/auth/service'
import { authFailure, authLimit } from '@/lib/auth/api'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try { authLimit(request); await resetPassword(await readApiJson(request)); return apiSuccess({ changed: true }) }
  catch (error) { return authFailure(error) }
}

import { z } from 'zod'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { requestPasswordReset } from '@/lib/auth/service'
import { authFailure, authLimit } from '@/lib/auth/api'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try { authLimit(request); const body = z.object({ email: z.string() }).strict().parse(await readApiJson(request)); return apiSuccess(await requestPasswordReset(body.email)) }
  catch (error) { return authFailure(error) }
}

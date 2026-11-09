import { z } from 'zod'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { refreshSession } from '@/lib/auth/service'
import { authFailure, authLimit } from '@/lib/auth/api'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try { authLimit(request); const body = z.object({ refreshToken: z.string().max(128) }).strict().parse(await readApiJson(request)); return apiSuccess(await refreshSession(body.refreshToken)) }
  catch (error) { return authFailure(error) }
}

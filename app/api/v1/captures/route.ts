import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { beginCaptureForOwner } from '@/lib/listings/capture'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true })
    return apiSuccess(await beginCaptureForOwner(identity.userId, identity.sessionId, await readApiJson(request)), 201)
  } catch (error) { return apiFailure(error, 'captures') }
}

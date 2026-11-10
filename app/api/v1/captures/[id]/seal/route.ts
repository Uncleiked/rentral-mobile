import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { sealCaptureForOwner } from '@/lib/listings/capture'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    return apiSuccess(await sealCaptureForOwner(identity.userId, identity.sessionId, z.uuid().parse((await context.params).id), await readApiJson(request)))
  } catch (error) { return apiFailure(error, 'captures/seal') }
}

import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { getCaptureForOwner } from '@/lib/listings/capture'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    return apiSuccess(await getCaptureForOwner(identity.userId, z.uuid().parse((await context.params).id)))
  } catch (error) { return apiFailure(error, 'captures/detail') }
}

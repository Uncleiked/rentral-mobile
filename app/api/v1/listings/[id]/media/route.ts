import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { listingMediaForApi } from '@/lib/api/media'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const id = z.uuid().parse((await params).id)
    return apiSuccess(await listingMediaForApi(identity.userId, id))
  } catch (error) { return apiFailure(error, 'media') }
}

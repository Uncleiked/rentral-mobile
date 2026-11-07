import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess } from '@/lib/api/http'
import { publicListingDetails } from '@/lib/api/projection'
import { getListingDetails } from '@/lib/discovery'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const id = z.uuid().parse((await params).id)
    const listing = await getListingDetails(id, identity.userId)
    if (!listing) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable.')
    return apiSuccess(publicListingDetails(listing))
  } catch (error) { return apiFailure(error, 'listing') }
}

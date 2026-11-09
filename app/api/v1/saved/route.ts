import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { publicListing } from '@/lib/api/projection'
import { getSavedListings } from '@/lib/discovery'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const listings = await getSavedListings(identity.userId)
    return apiSuccess({ items: listings.map(publicListing), limit: 100 })
  } catch (error) { return apiFailure(error, 'saved') }
}

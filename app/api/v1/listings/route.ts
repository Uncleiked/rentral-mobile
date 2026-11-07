import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { publicListing } from '@/lib/api/projection'
import { getDiscoveryListings } from '@/lib/discovery'
import { DISCOVERY_PAGE_SIZE, encodeDiscoveryCursor, parseDiscoveryFilters } from '@/lib/discovery-policy'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const filters = parseDiscoveryFilters(apiSearchParams(request))
    const page = await getDiscoveryListings(filters, identity.userId)
    return apiSuccess({ items: page.listings.map(publicListing), pagination: {
      limit: DISCOVERY_PAGE_SIZE, nextCursor: page.nextCursor ? encodeDiscoveryCursor(page.nextCursor) : null,
    } })
  } catch (error) { return apiFailure(error, 'listings') }
}

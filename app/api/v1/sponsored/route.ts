import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { commercialFailure } from '@/lib/api/commerce'
import { parseDiscoveryFilters } from '@/lib/discovery-policy'
import { publicSponsoredPlacements, sponsoredPlacements } from '@/lib/commerce/placements'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(publicSponsoredPlacements(await sponsoredPlacements(parseDiscoveryFilters(apiSearchParams(request)), actor.userId))) }
  catch (error) { return commercialFailure(error, 'sponsored') }
}

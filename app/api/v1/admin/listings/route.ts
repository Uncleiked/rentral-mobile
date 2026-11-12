import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { adminListingSearchSchema } from '@/lib/contracts/admin-search'
import { searchAdminListings } from '@/lib/operations/admin-listings'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { admission: false, platform: true })
    const input = adminListingSearchSchema.parse(apiSearchParams(request))
    return apiSuccess(await searchAdminListings(identity.userId, input))
  } catch (error) { return adminFailure(error, 'admin-listings') }
}

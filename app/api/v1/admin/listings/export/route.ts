import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { adminListingExportSearchSchema } from '@/lib/contracts/admin-search'
import { exportAdminListings } from '@/lib/operations/admin-listings'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { admission: false, platform: true })
    const input = adminListingExportSearchSchema.parse(apiSearchParams(request))
    const result = await exportAdminListings(identity.userId, input)
    return new Response(result.csv, { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rentral-listings.csv"',
      'Cache-Control': 'private, no-store', 'Vary': 'Authorization, Cookie', 'X-Content-Type-Options': 'nosniff',
      'X-Rentral-Export-Rows': String(result.rows), 'X-Rentral-Export-Matched': String(result.total),
      'X-Rentral-Export-Truncated': String(result.truncated), 'X-Rentral-Export-Generated-At': result.generatedAt,
    } })
  } catch (error) { return adminFailure(error, 'admin-listings-export') }
}

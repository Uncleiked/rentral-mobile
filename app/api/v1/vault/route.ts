import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { archiveQuerySchema } from '@/lib/api/archive'
import { ownListingPage } from '@/lib/api/listings'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const identity = await requireApiIdentity(request); return apiSuccess(await ownListingPage(identity.userId, archiveQuerySchema.parse(apiSearchParams(request)), true)) }
  catch (error) { return apiFailure(error, 'vault') }
}

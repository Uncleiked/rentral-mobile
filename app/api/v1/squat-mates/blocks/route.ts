import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { matchingFailure } from '@/lib/api/matching'
import { ownMatchingBlocks } from '@/lib/matching/blocks'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await ownMatchingBlocks(actor.userId, archiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return matchingFailure(error, 'matching-blocks') }
}

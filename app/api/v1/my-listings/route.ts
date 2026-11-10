import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { ensureAccountHandle } from '@/lib/accounts/bootstrap'
import { saveDraftInputSchema, saveListingInputSchema } from '@/lib/schemas'
import { saveDraftForUser, saveListingForUser } from '@/lib/listings/service'
import { ownListingPage } from '@/lib/api/listings'
import { archiveQuerySchema } from '@/lib/api/archive'

export const runtime = 'nodejs'

const listingMutationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('draft'), listing: saveDraftInputSchema.strict() }).strict(),
  z.object({ mode: z.literal('submit'), listing: saveListingInputSchema.strict() }).strict(),
])

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { verified: true })
    return apiSuccess(await ownListingPage(identity.userId, archiveQuerySchema.parse(apiSearchParams(request))))
  } catch (error) { return apiFailure(error, 'my-listings') }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true })
    const input = listingMutationSchema.parse(await readApiJson(request))
    if (!await ensureAccountHandle(identity.userId)) throw new ApiError(403, 'ACCOUNT_REQUIRED', 'Your account is unavailable. Please sign in again.')
    if (input.mode === 'draft') {
      const result = await saveDraftForUser(identity.userId, input.listing)
      if (!result.success) throw new ApiError(result.status ?? (result.uncertain ? 503 : result.code ? 409 : 400), result.code ?? (result.uncertain ? 'SAVE_UNCERTAIN' : 'LISTING_REJECTED'), result.error)
      return apiSuccess({ id: result.draftId, status: 'draft' }, 201)
    }
    const result = await saveListingForUser(identity.userId, input.listing)
    if (!result.success) throw new ApiError(result.status ?? (result.uncertain ? 503 : result.code ? 409 : 400), result.code ?? (result.uncertain ? 'SAVE_UNCERTAIN' : 'LISTING_REJECTED'), result.error)
    return apiSuccess({ id: result.listingId, status: 'pending_verification' }, 201)
  } catch (error) { return apiFailure(error, 'my-listings') }
}

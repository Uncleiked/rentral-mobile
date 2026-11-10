import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { ownListingDetail } from '@/lib/api/listings'
import { updateListingInputSchema } from '@/lib/contracts/listings'
import { setListingArchivedForUser, updateListingForUser } from '@/lib/listings/service'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
const editSchema = z.discriminatedUnion('operation', [z.object({ operation: z.literal('update'), listing: updateListingInputSchema.omit({ listingId: true }).strict() }).strict(),
  z.object({ operation: z.literal('archive'), archived: z.boolean() }).strict()])
export async function GET(request: Request, context: Context): Promise<Response> {
  try { const identity = await requireApiIdentity(request); return apiSuccess(await ownListingDetail(identity.userId, z.uuid().parse((await context.params).id))) }
  catch (error) { return apiFailure(error, 'my-listings/detail') }
}
export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    const id = z.uuid().parse((await context.params).id)
    const input = editSchema.parse(await readApiJson(request))
    const result = input.operation === 'archive' ? await setListingArchivedForUser(identity.userId, id, input.archived)
      : await updateListingForUser(identity.userId, { ...input.listing, listingId: id })
    if (!result.success) throw new ApiError(result.status ?? (result.uncertain ? 503 : result.code ? 409 : 400), result.code ?? (result.uncertain ? 'SAVE_UNCERTAIN' : 'LISTING_REJECTED'), result.error)
    return apiSuccess(await ownListingDetail(identity.userId, id))
  } catch (error) { return apiFailure(error, 'my-listings/detail') }
}

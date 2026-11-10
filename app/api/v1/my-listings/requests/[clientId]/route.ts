import { createHash } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { listingMutationResultSchema } from '@/lib/contracts/listings'

export const runtime = 'nodejs'
type Context = { params: Promise<{ clientId: string }> }
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const clientId = z.uuid().parse((await context.params).clientId).toLowerCase()
    const { mode } = z.object({ mode: z.enum(['draft', 'submit']) }).strict().parse(apiSearchParams(request))
    const scope = mode === 'draft' ? 'listing_draft_save' : 'listing_submit'
    const id = createHash('sha256').update(`${identity.userId}\0${scope}\0${clientId}`).digest('hex')
    const receipt = await prisma.mutationReceipt.findFirst({ where: { id, actor_id: identity.userId, scope, client_id: clientId }, select: { resource_id: true } })
    const listing = receipt ? await prisma.listing.findFirst({ where: { id: receipt.resource_id, lister_id: identity.userId }, select: { id: true, listing_status: true } }) : null
    if (!listing) throw new ApiError(404, 'REQUEST_NOT_FOUND', 'No completed listing request was found. Check your listings before preparing another request.')
    return apiSuccess(listingMutationResultSchema.parse({ id: listing.id, status: listing.listing_status }))
  } catch (error) { return apiFailure(error, 'my-listings/requests') }
}

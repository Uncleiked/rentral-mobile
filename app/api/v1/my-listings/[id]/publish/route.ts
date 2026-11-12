import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { MutationConflictError } from '@/lib/database/mutations'
import { ApiError, apiFailure, apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { publishOwnListing, readOwnPublicationRequest } from '@/lib/listings/publishing'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true })
    const { id } = await context.params
    const result = await publishOwnListing(identity.userId, z.uuid().parse(id), await readApiJson(request))
    revalidatePath('/marketplace'); revalidatePath('/marketplace/listing'); revalidatePath(`/marketplace/listing/${id}`)
    return apiSuccess(result)
  } catch (error) { return apiFailure(error instanceof MutationConflictError ? new ApiError(409, error.code, error.message) : error, 'my-listings/publish') }
}
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { verified: true })
    const { id } = await context.params
    const query = z.object({ clientId: z.uuid(), expectedRevision: z.coerce.number().int().nonnegative() }).strict().parse(apiSearchParams(request))
    return apiSuccess(await readOwnPublicationRequest(identity.userId, z.uuid().parse(id), query))
  } catch (error) { return apiFailure(error instanceof MutationConflictError ? new ApiError(409, error.code, error.message) : error, 'my-listings/publish') }
}

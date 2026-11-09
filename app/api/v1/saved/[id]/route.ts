import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { updateSavedListing } from '@/lib/api/saved'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }

async function update(request: Request, context: Context, saved: boolean): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const listingId = z.uuid().parse((await context.params).id)
    const result = await updateSavedListing(identity.userId, listingId, saved)
    revalidatePath('/marketplace/saved')
    revalidatePath('/marketplace')
    revalidatePath(`/marketplace/listing/${listingId}`)
    return apiSuccess(result)
  } catch (error) { return apiFailure(error, 'saved') }
}

export async function PUT(request: Request, context: Context): Promise<Response> { return update(request, context, true) }
export async function DELETE(request: Request, context: Context): Promise<Response> { return update(request, context, false) }

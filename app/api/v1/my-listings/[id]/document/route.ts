import { z } from 'zod'
import prisma from '@/lib/db'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess } from '@/lib/api/http'
import { createAdminClient } from '@/lib/admin'
import { requireOwnedStoragePath } from '@/lib/local-storage/policy'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const id = z.uuid().parse((await params).id)
    const listing = await prisma.listing.findFirst({ where: { id, lister_id: identity.userId }, select: { document_path: true } })
    if (!listing?.document_path) throw new ApiError(404, 'NOT_FOUND', 'This private document is unavailable to your account.')
    try { requireOwnedStoragePath('compliance-docs', listing.document_path, identity.userId) }
    catch { throw new ApiError(404, 'NOT_FOUND', 'This private document is unavailable to your account.') }
    const signed = await createAdminClient().storage.from('compliance-docs').createSignedUrl(listing.document_path, 300)
    if (signed.error || !signed.data?.signedUrl) throw new ApiError(503, 'DOCUMENT_UNAVAILABLE', 'Your document is temporarily unavailable. Retry to obtain a fresh private link.')
    return apiSuccess({ url: signed.data.signedUrl, expiresAt: new Date(Date.now() + 300000).toISOString() })
  } catch (error) { return apiFailure(error, 'my-listings/document') }
}

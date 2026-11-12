import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { adminFailure, adminIdSchema } from '@/lib/api/admin'
import { getAdminListingMedia } from '@/lib/operations/admin-media'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { admission: false, platform: true })
    return apiSuccess(await getAdminListingMedia(identity.userId, adminIdSchema.parse((await params).id)))
  } catch (error) { return adminFailure(error, 'admin-media') }
}

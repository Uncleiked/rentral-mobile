import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { adminCommandSchema } from '@/lib/contracts/admin'
import { executeAdminCommand } from '@/lib/operations/admin-console'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { admission: false, platform: true, mutation: true })
    const data = adminCommandSchema.parse(await readApiJson(request))
    started = true
    const receipt = await executeAdminCommand(identity.userId, data)
    // The receipt is already committed. Cache refresh cannot change that result
    // or cause a client to send a new grant after a successful decision.
    try {
      revalidatePath('/admin')
      if (['set_gallery_permission', 'set_free_posting_permission', 'set_direct_publish_permission', 'suspend_user', 'restore_user'].includes(data.operation)) {
        revalidatePath('/marketplace/listing/create')
        revalidatePath('/marketplace/listing')
        revalidatePath('/marketplace/notifications')
        revalidatePath('/marketplace')
      }
      revalidatePath('/marketplace/listing/[id]', 'page')
      revalidatePath('/marketplace/profile/[username]', 'page')
    } catch {
      console.warn('[admin-command] Decision saved; affected pages may need a refresh.')
    }
    return apiSuccess(receipt)
  } catch (error) { return adminFailure(error, 'admin-command', started) }
}

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
      if (data.operation === 'set_gallery_permission') {
        revalidatePath('/marketplace/listing/create')
        revalidatePath('/marketplace/listing')
        revalidatePath('/marketplace/notifications')
        revalidatePath('/marketplace')
      }
    } catch {
      console.warn('[admin-command] Decision saved; affected pages may need a refresh.')
    }
    return apiSuccess(receipt)
  } catch (error) { return adminFailure(error, 'admin-command', started) }
}

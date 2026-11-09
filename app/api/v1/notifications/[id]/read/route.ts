import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { readNotificationForApi } from '@/lib/api/notifications'

export const runtime = 'nodejs'
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = z.uuid().parse((await params).id)
    if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024))
    const result = await readNotificationForApi(identity.userId, id)
    revalidatePath('/marketplace/notifications')
    return apiSuccess(result)
  } catch (error) { return apiFailure(error, 'notification-read') }
}

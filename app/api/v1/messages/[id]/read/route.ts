import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { markConversationRead } from '@/lib/messaging/service'

export const runtime = 'nodejs'
const input = z.object({ messageId: z.uuid().optional() }).strict()
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { userId } = await requireApiIdentity(request, { platform: true, mutation: true })
    const id = z.uuid().parse((await context.params).id)
    const data = input.parse(await readApiJson(request, 1024))
    if (!await markConversationRead(userId, id, data.messageId)) throw new ApiError(404, 'NOT_FOUND', 'This conversation is unavailable.')
    return apiSuccess({ read: true })
  } catch (error) { return apiFailure(error, 'messages/read') }
}

import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { readMessageCommand } from '@/lib/messaging/service'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const conversationId = z.uuid().parse((await params).id)
    const { clientId } = z.object({ clientId: z.uuid() }).strict().parse(apiSearchParams(request))
    const id = await readMessageCommand(identity.userId, conversationId, clientId)
    if (!id) throw new ApiError(404, 'NOT_COMMITTED', 'This message has not been recorded.')
    return apiSuccess({ id })
  } catch (error) { return apiFailure(error, 'messages/send') }
}

import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { conversationActivityInput, conversationActivitySchema } from '@/lib/contracts/messaging'
import { clearConversationActivity, getConversationActivity, setConversationActivity } from '@/lib/messaging/activity'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { userId } = await requireApiIdentity(request, { platform: true })
    const result = await getConversationActivity(userId, z.uuid().parse((await context.params).id))
    if (!result) throw new ApiError(404, 'NOT_FOUND', 'This conversation is unavailable.')
    return apiSuccess(conversationActivitySchema.parse(result))
  } catch (error) { return apiFailure(error, 'messages/activity') }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { userId } = await requireApiIdentity(request, { platform: true, mutation: true })
    const id = z.uuid().parse((await context.params).id)
    const input = conversationActivityInput.parse(await readApiJson(request, 1024))
    await setConversationActivity(userId, id, input.typing)
    return apiSuccess({ recorded: true })
  } catch (error) { return apiFailure(error, 'messages/activity') }
}
export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const { userId } = await requireApiIdentity(request, { platform: true, mutation: true })
    await clearConversationActivity(userId, z.uuid().parse((await context.params).id))
    return apiSuccess({ cleared: true })
  } catch (error) { return apiFailure(error, 'messages/activity') }
}

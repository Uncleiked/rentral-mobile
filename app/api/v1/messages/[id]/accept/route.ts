import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, ApiError, apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { acceptConversationInputSchema } from '@/lib/contracts/messaging'
import { acceptDirectConversation, readConversationAcceptance } from '@/lib/messaging/direct'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const conversationId = z.uuid().parse((await params).id)
    const input = acceptConversationInputSchema.parse(await readApiJson(request))
    const id = await acceptDirectConversation(identity.userId, conversationId, input)
    revalidatePath('/marketplace/messages')
    return apiSuccess({ id, accepted: true })
  } catch (error) { return apiFailure(error, 'messages/accept') }
}
export async function GET(request: Request, { params }: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const conversationId = z.uuid().parse((await params).id)
    const input = acceptConversationInputSchema.parse(apiSearchParams(request))
    const id = await readConversationAcceptance(identity.userId, conversationId, input)
    if (!id) throw new ApiError(404, 'NOT_COMMITTED', 'This acceptance has not been recorded.')
    return apiSuccess({ id, accepted: true })
  } catch (error) { return apiFailure(error, 'messages/accept') }
}

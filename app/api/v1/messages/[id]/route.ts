import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { getThread, persistMessage } from '@/lib/messaging/service'

export const runtime = 'nodejs'
const newMessage = z.object({ clientId: z.uuid(), body: z.string().max(4000), sharedListingId: z.uuid().optional() }).strict()

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const id = z.uuid().parse((await params).id)
    const before = new URL(request.url).searchParams.get('before')
    const cursor = before === null ? undefined : z.uuid().parse(before)
    const thread = await getThread(identity.userId, id, cursor)
    if (!thread) throw new ApiError(404, 'NOT_FOUND', 'This conversation is unavailable.')
    return apiSuccess(thread)
  } catch (error) { return apiFailure(error, 'thread') }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const conversationId = z.uuid().parse((await params).id)
    const input = newMessage.parse(await readApiJson(request))
    const id = await persistMessage(identity.userId, { ...input, conversationId })
    revalidatePath('/marketplace/messages')
    revalidatePath('/marketplace/notifications')
    return apiSuccess({ id }, 201)
  } catch (error) { return apiFailure(error, 'thread') }
}

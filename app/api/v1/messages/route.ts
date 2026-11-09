import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { archiveQuerySchema, nextArchiveCursor } from '@/lib/api/archive'
import { beginConversation, getInbox } from '@/lib/messaging/service'

export const runtime = 'nodejs'
const conversationInput = z.object({ listingId: z.uuid() }).strict()

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const query = archiveQuerySchema.parse(apiSearchParams(request))
    const conversations = await getInbox(identity.userId, query)
    return apiSuccess({ items: conversations.slice(0, query.limit).map(thread => ({
      id: thread.id, listingId: thread.listing_id, updatedAt: thread.updatedAt.toISOString(),
      otherName: (thread.seeker_id === identity.userId ? thread.lister.username : thread.seeker.username) ?? 'Rentral member',
      lastMessage: thread.messages[0]?.body ?? null,
      unread: Boolean(thread.messages[0] && thread.messages[0].sender_id !== identity.userId &&
        (!(thread.seeker_id === identity.userId ? thread.seeker_read_at : thread.lister_read_at) || thread.messages[0].createdAt > (thread.seeker_id === identity.userId ? thread.seeker_read_at! : thread.lister_read_at!))),
    })), limit: query.limit, nextCursor: nextArchiveCursor(conversations.map(item => ({ id: item.id, createdAt: item.updatedAt })), query.limit) })
  } catch (error) { return apiFailure(error, 'messages') }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = conversationInput.parse(await readApiJson(request))
    const id = await beginConversation(identity.userId, input.listingId)
    revalidatePath('/marketplace/messages')
    return apiSuccess({ id }, 201)
  } catch (error) { return apiFailure(error, 'messages') }
}

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { beginConversation, getInbox } from '@/lib/messaging/service'

export const runtime = 'nodejs'
const conversationInput = z.object({ listingId: z.uuid() }).strict()

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const conversations = await getInbox(identity.userId)
    return apiSuccess({ items: conversations.map(thread => ({
      id: thread.id, listingId: thread.listing_id, updatedAt: thread.updatedAt.toISOString(),
      otherName: (thread.seeker_id === identity.userId ? thread.lister.username : thread.seeker.username) ?? 'Rentral member',
      lastMessage: thread.messages[0]?.body ?? null,
    })), limit: 50 })
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

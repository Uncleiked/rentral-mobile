import { z } from 'zod'

export const messageInput = z.object({
  conversationId: z.uuid(),
  clientId: z.uuid(),
  body: z.string().trim().max(4000),
  sharedListingId: z.uuid().optional(),
}).strict().refine(value => value.body.length > 0 || Boolean(value.sharedListingId), 'Write a message or attach a listing.')

export function conversationMember(userId: string, conversation: { seeker_id: string; lister_id: string }): boolean {
  return conversation.seeker_id === userId || conversation.lister_id === userId
}

export function conversationTopic(id: string): string {
  return `rentral:conversation:${id}`
}

export type ChatMessage = {
  id: string
  senderId: string
  body: string
  sentAt: string
  sharedListing: { id: string; category: string } | null
}

export type ChatThread = {
  id: string
  userId: string
  otherName: string
  otherReadAt: string | null
  listingId: string
  messages: ChatMessage[]
  hasMore: boolean
}

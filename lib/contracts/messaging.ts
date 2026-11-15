import { z } from 'zod'
import { archiveQuerySchema } from '../api/archive'

export const conversationActivityInput = z.object({ typing: z.boolean() }).strict()
export const conversationActivitySchema = z.object({
  otherOnline: z.boolean(), otherTyping: z.boolean(),
  otherReadAt: z.iso.datetime().nullable(), latestMessageId: z.uuid().nullable(),
}).strict()
export type ConversationActivity = z.infer<typeof conversationActivitySchema>

/** TTL cleanup is best effort; readers always enforce these windows themselves. */
export const CONVERSATION_PRESENCE_MS = 45000
export const CONVERSATION_TYPING_MS = 8000

export const messageFolderSchema = z.enum(['primary', 'requests', 'sent'])
export const messageInboxQuerySchema = archiveQuerySchema.extend({ folder: messageFolderSchema.optional().default('primary') }).strict()
export const directConversationInputSchema = z.object({ recipientId: z.uuid(), clientId: z.uuid() }).strict()
export const acceptConversationInputSchema = z.object({ clientId: z.uuid() }).strict()
export const messageInboxItemSchema = z.object({
  id: z.uuid(), listingId: z.uuid().nullable(), updatedAt: z.iso.datetime(), otherId: z.uuid(), otherName: z.string().max(100),
  lastMessage: z.string().max(4000).nullable(), unread: z.boolean(), folder: messageFolderSchema,
  kind: z.enum(['listing', 'direct']), requestIncoming: z.boolean(), canSend: z.boolean(), canAccept: z.boolean(),
}).strict()
export const messageInboxPageSchema = z.object({
  items: z.array(messageInboxItemSchema).max(50), limit: z.number().int().min(1).max(50), nextCursor: z.string().nullable(),
}).strict()
export const messageThreadSchema = z.object({
  id: z.uuid(), userId: z.uuid(), otherId: z.uuid(), otherName: z.string().max(100), listingId: z.uuid().nullable(),
  otherReadAt: z.iso.datetime().nullable(), hasMore: z.boolean(), folder: messageFolderSchema, kind: z.enum(['listing', 'direct']),
  requestIncoming: z.boolean(), canSend: z.boolean(), canAccept: z.boolean(),
  messages: z.array(z.object({
    id: z.uuid(), senderId: z.uuid(), body: z.string().max(4000), sentAt: z.iso.datetime(),
    sharedListing: z.object({ id: z.uuid(), category: z.string().max(30) }).strict().nullable(),
  }).strict()).max(60),
}).strict()
export type MessageInboxQuery = z.infer<typeof messageInboxQuerySchema>
export type MessageInboxPage = z.infer<typeof messageInboxPageSchema>

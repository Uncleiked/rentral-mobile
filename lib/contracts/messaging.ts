import { z } from 'zod'

export const conversationActivityInput = z.object({ typing: z.boolean() }).strict()
export const conversationActivitySchema = z.object({
  otherOnline: z.boolean(), otherTyping: z.boolean(),
  otherReadAt: z.iso.datetime().nullable(), latestMessageId: z.uuid().nullable(),
}).strict()
export type ConversationActivity = z.infer<typeof conversationActivitySchema>

/** TTL cleanup is best effort; readers always enforce these windows themselves. */
export const CONVERSATION_PRESENCE_MS = 45000
export const CONVERSATION_TYPING_MS = 8000

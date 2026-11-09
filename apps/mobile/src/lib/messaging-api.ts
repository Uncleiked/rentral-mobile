import { z } from 'zod'
import { conversationActivitySchema } from '../../../../lib/contracts/messaging'
import { api, ApiError } from './api'

const id = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
export const messageSchema = z.object({ id, senderId: id, body: z.string().max(4000), sentAt: timestamp,
  sharedListing: z.object({ id, category: z.enum(['house', 'car', 'boat']) }).nullable() })
export const threadSchema = z.object({ id, userId: id, listingId: id, otherName: z.string().min(1).max(200), otherReadAt: timestamp.nullable(), hasMore: z.boolean(), messages: z.array(messageSchema).max(60) })
export const inboxSchema = z.object({ items: z.array(z.object({ id, listingId: id, updatedAt: timestamp, otherName: z.string().min(1).max(200), lastMessage: z.string().max(4000).nullable(), unread: z.boolean() })).max(50),
  nextCursor: z.string().max(100).nullable(), limit: z.number().int().min(1).max(50) })
export const messageCommandSchema = z.object({ clientId: id, body: z.string().trim().max(4000), sharedListingId: id.optional() }).strict()
  .refine(value => Boolean(value.body || value.sharedListingId), 'Write a message or choose a listing to share.')
export type MessageCommand = z.infer<typeof messageCommandSchema>
export type NativeThread = z.infer<typeof threadSchema>
export type NativeMessage = z.infer<typeof messageSchema>
function validated<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError('This conversation response could not be confirmed. Refresh before continuing.', 'INVALID_RESPONSE', 200)
  return parsed.data
}
export async function loadThread(conversationId: string, actorId: string, before?: string, signal?: AbortSignal) {
  const result = validated(threadSchema, await api<unknown>(`/messages/${id.parse(conversationId)}${before ? `?before=${encodeURIComponent(id.parse(before))}` : ''}`, { signal, expectedUserId: actorId }))
  if (result.id !== conversationId || result.userId !== actorId) throw new ApiError('This conversation is unavailable to your account.', 'INVALID_RESPONSE', 200)
  return result
}
export async function sendThreadMessage(conversationId: string, actorId: string, command: MessageCommand) {
  return validated(z.object({ id }), await api<unknown>(`/messages/${id.parse(conversationId)}`, { method: 'POST', body: messageCommandSchema.parse(command), expectedUserId: actorId }))
}
export async function loadThreadActivity(conversationId: string, actorId: string, signal?: AbortSignal) {
  return validated(conversationActivitySchema, await api<unknown>(`/messages/${id.parse(conversationId)}/activity`, { signal, expectedUserId: actorId }))
}
export async function publishThreadActivity(conversationId: string, actorId: string, typing: boolean) {
  return validated(z.object({ recorded: z.literal(true) }), await api<unknown>(`/messages/${id.parse(conversationId)}/activity`, { method: 'POST', body: { typing }, expectedUserId: actorId }))
}
export async function clearThreadActivity(conversationId: string, actorId: string) {
  return validated(z.object({ cleared: z.literal(true) }), await api<unknown>(`/messages/${id.parse(conversationId)}/activity`, { method: 'DELETE', expectedUserId: actorId }))
}
export async function markThreadRead(conversationId: string, actorId: string, messageId: string) {
  return validated(z.object({ read: z.literal(true) }), await api<unknown>(`/messages/${id.parse(conversationId)}/read`, { method: 'POST', body: { messageId: id.parse(messageId) }, expectedUserId: actorId }))
}

'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUserId, requireVerifiedUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { beginConversation, getThread, persistMessage } from '@/lib/messaging/service'
import { type ChatThread } from '@/lib/messaging/policy'

export async function startConversationAction(listingId: unknown): Promise<ActionResult<string>> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const parsed = z.uuid().safeParse(listingId)
    if (!parsed.success) return { success: false, error: 'Choose an available listing.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to start a conversation.' }
    const id = await beginConversation(userId, parsed.data)
    revalidatePath('/marketplace/messages')
    return { success: true, data: id }
  } catch {
    return { success: false, error: 'This listing is unavailable for a new conversation. Please try again.' }
  }
}

export async function sendMessageAction(input: unknown): Promise<ActionResult<string>> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to send messages.' }
    const id = await persistMessage(userId, input)
    revalidatePath('/marketplace/messages')
    revalidatePath('/marketplace/notifications')
    return { success: true, data: id }
  } catch (error) {
    return { success: false, error: error instanceof Error && error.message === 'RATE_LIMITED'
      ? 'You are sending messages quickly. Wait a moment and try again.' : 'Your message was not sent. Please try again.' }
  }
}

export async function readThreadAction(id: unknown, before?: unknown): Promise<ActionResult<ChatThread>> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const parsed = z.object({ id: z.uuid(), before: z.uuid().optional() }).safeParse({ id, before })
    if (!parsed.success) return { success: false, error: 'Conversation unavailable.' }
    const userId = await requireUserId()
    if (!userId) return { success: false, error: 'Sign in to read messages.' }
    const thread = await getThread(userId, parsed.data.id, parsed.data.before)
    return thread ? { success: true, data: thread } : { success: false, error: 'Conversation unavailable.' }
  } catch {
    return { success: false, error: 'Messages could not be refreshed. Please try again.' }
  }
}

export async function markThreadReadAction(id: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled() || !z.uuid().safeParse(id).success || typeof id !== 'string') {
      return { success: false, error: 'Conversation unavailable.' }
    }
    const userId = await requireUserId()
    if (!userId) return { success: false, error: 'Sign in to read messages.' }
    const now = new Date()
    const changed = await prisma.$transaction([
      prisma.conversation.updateMany({ where: { id, seeker_id: userId }, data: { seeker_read_at: now } }),
      prisma.conversation.updateMany({ where: { id, lister_id: userId }, data: { lister_read_at: now } }),
    ])
    if (!changed.some(result => result.count > 0)) return { success: false, error: 'Conversation unavailable.' }
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: 'Read receipt could not be saved.' }
  }
}

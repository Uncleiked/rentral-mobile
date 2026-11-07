'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { platformEnabled, type ActionResult } from '@/lib/platform'

export async function markNotificationAction(id: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: 'Notifications are not available yet.' }
    const parsed = z.uuid().safeParse(id)
    const userId = await requireUserId()
    if (!userId || !parsed.success) return { success: false, error: 'Notification unavailable.' }
    await prisma.notification.updateMany({ where: { id: parsed.data, user_id: userId, read_at: null }, data: { read_at: new Date() } })
    revalidatePath('/marketplace/notifications')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Notification could not be updated.' } }
}

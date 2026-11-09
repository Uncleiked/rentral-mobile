import { z } from 'zod'
import prisma from '@/lib/db'
import { ApiError } from './http'
import { archiveBoundary, nextArchiveCursor, type ArchiveQuery } from './archive'

const notificationSchema = z.object({
  id: z.uuid(), kind: z.string().min(1).max(80), title: z.string().min(1).max(200), body: z.string().max(4000),
  href: z.string().max(1000).nullable(), readAt: z.string().datetime({ offset: true }).nullable(), createdAt: z.string().datetime({ offset: true }),
}).strict()
const notificationPageSchema = z.object({ items: z.array(notificationSchema).max(50), nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()

export function notificationHref(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return null
  try {
    const url = new URL(value, 'https://rentral.invalid')
    if (url.origin !== 'https://rentral.invalid' || !/^\/marketplace(?:\/|$)/.test(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}
export async function notificationsForApi(userId: string, query: ArchiveQuery) {
  const rows = await prisma.notification.findMany({ where: { user_id: userId, ...archiveBoundary(query.cursor) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
    select: { id: true, kind: true, title: true, body: true, href: true, read_at: true, createdAt: true } })
  const result = notificationPageSchema.safeParse({ items: rows.slice(0, query.limit).map(row => ({
    id: row.id, kind: row.kind, title: row.title, body: row.body, href: notificationHref(row.href),
    readAt: row.read_at?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
  })), nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit })
  if (!result.success) throw new ApiError(503, 'NOTIFICATIONS_UNAVAILABLE', 'Notifications could not be verified. Please refresh.')
  return result.data
}
export async function readNotificationForApi(userId: string, id: string): Promise<{ id: string; readAt: string }> {
  await prisma.notification.updateMany({ where: { id, user_id: userId, OR: [{ read_at: null }, { read_at: { isSet: false } }] }, data: { read_at: new Date() } })
  const row = await prisma.notification.findFirst({ where: { id, user_id: userId }, select: { id: true, read_at: true } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This notification is unavailable.')
  if (!row.read_at) throw new ApiError(503, 'NOTIFICATION_UNCONFIRMED', 'The notification update could not be confirmed. Please refresh.')
  return { id: row.id, readAt: row.read_at.toISOString() }
}

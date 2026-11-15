import { z } from 'zod'
export const notificationSchema = z.object({
  id: z.uuid(), kind: z.string().min(1).max(80), title: z.string().min(1).max(200), body: z.string().max(4000),
  href: z.string().max(1000).nullable(), readAt: z.string().datetime({ offset: true }).nullable(), createdAt: z.string().datetime({ offset: true }),
}).strict()
export const notificationPageSchema = z.object({ items: z.array(notificationSchema).max(50), nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const notificationReadSchema = z.object({ id: z.uuid(), readAt: z.string().datetime({ offset: true }) }).strict()
export type Notification = z.infer<typeof notificationSchema>

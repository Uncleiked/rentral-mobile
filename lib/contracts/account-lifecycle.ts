import { z } from 'zod'

export const accountCloseSchema = z.object({ currentPassword: z.string().min(1).max(128) }).strict()
export const accountCloseResultSchema = z.object({ closed: z.literal(true), signInRequired: z.literal(true) }).strict()
export const accountExportResources = ['profile', 'listings', 'bookings', 'payments', 'financial', 'messages', 'notifications', 'reviews', 'reports', 'saved', 'consents'] as const
export const accountExportResourceSchema = z.enum(accountExportResources)
export const accountExportQuerySchema = z.object({ resource: accountExportResourceSchema.optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict()
export const accountExportPageSchema = z.object({ version: z.literal(1), resource: accountExportResourceSchema, generatedAt: z.string().datetime({ offset: true }), items: z.array(z.record(z.string(), z.unknown())).max(100), nextCursor: z.string().uuid().nullable() }).strict()
export const accountExportManifestSchema = z.object({ version: z.literal(1), resources: z.array(accountExportResourceSchema), description: z.string() }).strict()
export type AccountExportResource = z.infer<typeof accountExportResourceSchema>
export type AccountExportPage = z.infer<typeof accountExportPageSchema>

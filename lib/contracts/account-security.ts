import { z } from 'zod'

export const authDeliverySchema = z.enum(['email', 'development-outbox'])
export const emailChangeSchema = z.object({ id: z.string().uuid(), newEmail: z.string().email().max(254), oldConfirmed: z.boolean(), newConfirmed: z.boolean(), expiresAt: z.string().datetime({ offset: true }) }).strict()
export const accountSecuritySchema = z.object({ email: z.string().email().max(254), delivery: z.enum(['email', 'development-outbox', 'unavailable']), emailChange: emailChangeSchema.nullable() }).strict()
export const accountSessionsSchema = z.object({ items: z.array(z.object({ id: z.string().uuid(), createdAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }), current: z.boolean() }).strict()).max(50), nextCursor: z.string().max(512).nullable() }).strict()
export const accountPasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8).max(128) }).strict()
export const accountPasswordResultSchema = z.object({ changed: z.literal(true), signInRequired: z.literal(true) }).strict()
export const accountEmailChangeRequestSchema = z.object({ newEmail: z.string().trim().toLowerCase().email().max(254), currentPassword: z.string().min(1).max(128) }).strict()
export const accountEmailChangeResultSchema = z.object({ pending: emailChangeSchema, delivery: authDeliverySchema }).strict()
export const accountEmailConfirmSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()
export const accountEmailConfirmResultSchema = z.object({ status: z.enum(['waiting', 'completed']), signInRequired: z.boolean() }).strict()
export const accountSessionRevocationSchema = z.object({ revoked: z.literal(true), current: z.boolean().optional(), signInRequired: z.literal(true).optional() }).strict()
export type AccountSecurity = z.infer<typeof accountSecuritySchema>
export type AccountSessions = z.infer<typeof accountSessionsSchema>
export type EmailChangeView = z.infer<typeof emailChangeSchema>

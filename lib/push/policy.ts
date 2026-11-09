import { z } from 'zod'
export const expoPushTokenSchema = z.string().max(240).regex(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$/)
export const pushInstallationSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const pushConsentVersionSchema = z.number().int().min(0).max(2147483647)
export const pushRegistrationSchema = z.object({ installationId: z.uuid().transform(value => value.toLowerCase()), installationSecret: pushInstallationSecretSchema,
  expoPushToken: expoPushTokenSchema, projectId: z.uuid(), platform: z.enum(['android', 'ios']), permissionGranted: z.literal(true), optIn: z.literal(true), expectedConsentVersion: pushConsentVersionSchema }).strict()
export const pushInstallationRevokeSchema = z.object({ installationId: z.uuid().transform(value => value.toLowerCase()) }).strict()
export class PushError extends Error {
  constructor(message: string, readonly code = 'PUSH_UNAVAILABLE', readonly status = 409) { super(message) }
}
export const pushDeviceSchema = z.object({ id: z.uuid(), installationId: z.uuid(), platform: z.enum(['android', 'ios']), status: z.enum(['active', 'revoked', 'unregistered']),
  optedInAt: z.string().datetime({ offset: true }), revokedAt: z.string().datetime({ offset: true }).nullable(), createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }) }).strict()
export const pushCapabilitySchema = z.object({ enabled: z.boolean(), projectId: z.uuid().nullable(), consentVersion: pushConsentVersionSchema, devices: z.array(pushDeviceSchema).max(50) }).strict()
export const pushRegistrationResultSchema = z.object({ device: pushDeviceSchema, consentVersion: pushConsentVersionSchema }).strict()
export function pushSourceCutoff(configured: Date, now = new Date()): Date { return new Date(Math.max(configured.getTime(), now.getTime() - 24 * 3600000)) }

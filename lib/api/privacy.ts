import { z } from 'zod'
import { AnalyticsError } from '@/lib/analytics/service'
import { ApiError, apiFailure } from './http'

export const analyticsConsentInputSchema = z.object({ allowed: z.boolean() }).strict()
export const analyticsPrivacySchema = z.object({ allowed: z.boolean(), updatedAt: z.string().datetime({ offset: true }).nullable(),
  collectionEnabled: z.boolean(), retentionDays: z.literal(90) }).strict()
export function publicAnalyticsPrivacy(value: unknown): z.infer<typeof analyticsPrivacySchema> {
  const result = analyticsPrivacySchema.safeParse(value)
  if (!result.success) throw new ApiError(503, 'PRIVACY_UNAVAILABLE', 'Your analytics settings could not be verified. Please refresh.')
  return result.data
}
export function privacyFailure(error: unknown, scope: string): Response {
  return apiFailure(error instanceof AnalyticsError ? new ApiError(503, 'PRIVACY_UNAVAILABLE', error.message) : error, scope)
}

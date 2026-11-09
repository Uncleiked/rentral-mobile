import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { analyticsConsentInputSchema, publicAnalyticsPrivacy, privacyFailure } from '@/lib/api/privacy'
import { analyticsPrivacy, setAnalyticsConsent } from '@/lib/analytics/service'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    return apiSuccess(publicAnalyticsPrivacy(await analyticsPrivacy(identity.userId)))
  } catch (error) { return privacyFailure(error, 'privacy-analytics') }
}
export async function PATCH(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true })
    const input = analyticsConsentInputSchema.parse(await readApiJson(request, 1024))
    await setAnalyticsConsent(identity.userId, input.allowed)
    return apiSuccess(publicAnalyticsPrivacy(await analyticsPrivacy(identity.userId)))
  } catch (error) { return privacyFailure(error, 'privacy-analytics') }
}

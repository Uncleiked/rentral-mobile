import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { privacyFailure } from '@/lib/api/privacy'
import { insightEventSchema } from '@/lib/analytics/policy'
import { recordConsentedInsight } from '@/lib/analytics/service'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const event = insightEventSchema.parse(await readApiJson(request, 2048))
    return apiSuccess({ recorded: await recordConsentedInsight(identity.userId, event) })
  } catch (error) { return privacyFailure(error, 'privacy-analytics-event') }
}

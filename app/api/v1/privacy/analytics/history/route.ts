import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { privacyFailure } from '@/lib/api/privacy'
import { withdrawAnalyticsHistory } from '@/lib/analytics/service'

export const runtime = 'nodejs'
export async function DELETE(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true })
    if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024))
    await withdrawAnalyticsHistory(identity.userId)
    return apiSuccess({ removed: true, allowed: false })
  } catch (error) { return privacyFailure(error, 'privacy-analytics-history') }
}

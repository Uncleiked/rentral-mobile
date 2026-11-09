import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { createdMatchingResult, matchingFailure } from '@/lib/api/matching'
import { matchingReportInputSchema } from '@/lib/matching/policy'
import { openMatchingReport, ownMatchingReports } from '@/lib/matching/reports'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await ownMatchingReports(actor.userId, archiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return matchingFailure(error, 'matching-reports') }
}
export async function POST(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = matchingReportInputSchema.parse(await readApiJson(request, 24576)); started = true
    return apiSuccess(createdMatchingResult(await openMatchingReport(actor.userId, input)), 201)
  } catch (error) { return matchingFailure(error, 'matching-report-create', started) }
}

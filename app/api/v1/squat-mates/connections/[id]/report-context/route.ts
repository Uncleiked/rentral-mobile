import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { matchingFailure, type MatchingRouteContext } from '@/lib/api/matching'
import { matchingReportContext } from '@/lib/matching/reports'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await matchingReportContext(actor.userId, z.uuid().parse((await params).id))) }
  catch (error) { return matchingFailure(error, 'matching-report-context') }
}

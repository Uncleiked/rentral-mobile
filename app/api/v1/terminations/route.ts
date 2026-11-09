import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { createdLeaseRequest, leaseArchiveQuerySchema, lifecycleFailure, terminationsForApi } from '@/lib/api/lifecycle'
import { requestTermination } from '@/lib/lifecycle/service'
import { terminationRequestSchema } from '@/lib/lifecycle/policy'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await terminationsForApi(actor.userId, leaseArchiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return lifecycleFailure(error, 'terminations') }
}
export async function POST(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = terminationRequestSchema.parse(await readApiJson(request, 24576)); started = true
    return apiSuccess(createdLeaseRequest(await requestTermination(actor.userId, input)), 201)
  } catch (error) { return lifecycleFailure(error, 'termination-create', started) }
}

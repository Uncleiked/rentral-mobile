import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { createdLeaseRequest, leaseArchiveQuerySchema, lifecycleFailure, renewalsForApi } from '@/lib/api/lifecycle'
import { requestRenewal } from '@/lib/lifecycle/service'
import { renewalRequestSchema } from '@/lib/lifecycle/policy'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await renewalsForApi(actor.userId, leaseArchiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return lifecycleFailure(error, 'renewals') }
}
export async function POST(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = renewalRequestSchema.parse(await readApiJson(request, 8192)); started = true
    return apiSuccess(createdLeaseRequest(await requestRenewal(actor.userId, input)), 201)
  } catch (error) { return lifecycleFailure(error, 'renewal-create', started) }
}

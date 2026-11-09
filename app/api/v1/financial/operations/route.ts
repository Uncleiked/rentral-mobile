import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { requestFinancialOperation } from '@/lib/payments/financial'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true, platform: true })
    return apiSuccess({ operation: await requestFinancialOperation(identity.userId, await readApiJson(request)) }, 201)
  } catch (error) { return apiFailure(financialApiError(error), 'financial/operations') }
}

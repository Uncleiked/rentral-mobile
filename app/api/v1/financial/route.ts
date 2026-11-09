import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { getFinancialWorkspace } from '@/lib/payments/financial'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const query = new URL(request.url).searchParams
    return apiSuccess(await getFinancialWorkspace(identity.userId, { staff: query.get('scope') === 'staff', operationsCursor: query.get('operationsCursor') ?? undefined, paymentsCursor: query.get('paymentsCursor') ?? undefined }))
  } catch (error) { return apiFailure(financialApiError(error), 'financial') }
}

import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { financialPaymentResultSchema } from '@/lib/contracts/financial'
import { getFinancialPayment } from '@/lib/payments/financial'

export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    return apiSuccess(financialPaymentResultSchema.parse({ payment: await getFinancialPayment(identity.userId, z.string().uuid().parse((await context.params).id)) }))
  } catch (error) { return apiFailure(financialApiError(error), 'financial/payments') }
}

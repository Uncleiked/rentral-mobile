import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { retryProviderReceipt } from '@/lib/payments/financial-receipts'
import { financialReasonSchema } from '@/lib/payments/financial-policy'

export const runtime = 'nodejs'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true, platform: true })
    const input = z.object({ reason: financialReasonSchema }).strict().parse(await readApiJson(request))
    await retryProviderReceipt(identity.userId, z.string().uuid().parse((await context.params).id), input.reason)
    return apiSuccess({ queued: true })
  } catch (error) { return apiFailure(financialApiError(error), 'financial/receipts') }
}

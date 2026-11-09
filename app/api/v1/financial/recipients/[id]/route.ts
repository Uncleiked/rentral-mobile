import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { disablePaymentRecipient } from '@/lib/payments/financial'

export const runtime = 'nodejs'
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true, platform: true })
    await disablePaymentRecipient(identity.userId, z.string().uuid().parse((await context.params).id))
    return apiSuccess({ removed: true })
  } catch (error) { return apiFailure(financialApiError(error), 'financial/recipients') }
}

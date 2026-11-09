import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { financialApiError } from '@/lib/api/financial'
import { decideFinancialOperation } from '@/lib/payments/financial'
import { executeFinancialOperation, finalizeFinancialTransfer, financialOperationForViewer, reconcileFinancialOperation, retryFinancialRefund } from '@/lib/payments/financial-execution'
import { financialReasonSchema } from '@/lib/payments/financial-policy'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['approve', 'reject']), reason: financialReasonSchema }).strict(),
  z.object({ action: z.enum(['execute', 'reconcile']) }).strict(),
  z.object({ action: z.literal('finalize'), otp: z.string().regex(/^\d{4,10}$/) }).strict(),
  z.object({ action: z.literal('retryRefund'), accountNumber: z.string().regex(/^\d{10}$/), bankId: z.string().regex(/^\d{1,20}$/) }).strict(),
])
export const runtime = 'nodejs'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true, verified: true, platform: true })
    const id = z.string().uuid().parse((await context.params).id), action = actionSchema.parse(await readApiJson(request))
    if (action.action === 'approve' || action.action === 'reject') return apiSuccess({ operation: await decideFinancialOperation(identity.userId, id, action.action, action.reason) })
    if (action.action === 'execute') return apiSuccess({ operation: await executeFinancialOperation(identity.userId, id) })
    if (action.action === 'finalize') return apiSuccess({ operation: await finalizeFinancialTransfer(identity.userId, id, action.otp) })
    if (action.action === 'retryRefund') return apiSuccess({ operation: await retryFinancialRefund(identity.userId, id, action) })
    await reconcileFinancialOperation(identity.userId, id)
    return apiSuccess({ operation: await financialOperationForViewer(identity.userId, id) })
  } catch (error) { return apiFailure(financialApiError(error), 'financial/operations') }
}

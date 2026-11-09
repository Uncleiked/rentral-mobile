'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { requireStaffId } from '@/lib/operations/access'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { LifecycleError, lifecycleCounterpartySchema, lifecycleDecisionSchema } from '@/lib/lifecycle/policy'
import { confirmRenewal, confirmTermination, reviewRenewal, reviewTermination } from '@/lib/lifecycle/service'
import { acknowledgeWorkerFailure } from '@/lib/lifecycle/operations'
import { reconcileNotificationEmail } from '@/lib/lifecycle/email-reconciliation'

function refreshLeasePages(): void {
  for (const path of ['/marketplace/admin/lifecycle', '/marketplace/renewals', '/marketplace/terminations', '/marketplace/bookings']) revalidatePath(path)
}
export async function reviewLifecycleAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = lifecycleDecisionSchema.safeExtend({ id: z.uuid(), kind: z.enum(['renewals', 'terminations']) }).parse(input)
    const actor = await requireStaffId(data.kind === 'renewals' ? 'renewal:review' : 'termination:review')
    if (!actor) return { success: false, error: 'Staff access required.' }
    const decision = { decision: data.decision, reason: data.reason }
    if (data.kind === 'renewals') await reviewRenewal(actor, data.id, decision)
    else await reviewTermination(actor, data.id, decision)
    refreshLeasePages()
    return { success: true, data: undefined }
  } catch (error) { return { success: false, error: error instanceof LifecycleError ? error.message : 'The review could not be confirmed. Refresh the queue before trying again.' } }
}
export async function acknowledgeLifecycleFailureAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(30).max(2000) }).strict().parse(input)
    const actor = await requireStaffId('operations:manage')
    if (!actor) return { success: false, error: 'Staff access required.' }
    await acknowledgeWorkerFailure(actor, data.id, data.reason); refreshLeasePages()
    return { success: true, data: undefined }
  } catch (error) { return { success: false, error: error instanceof LifecycleError ? error.message : 'The incident review could not be confirmed. Refresh before trying again.' } }
}
export async function reconcileLifecycleEmailAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = z.object({ id: z.uuid(), reason: z.string().trim().min(30).max(2000) }).strict().parse(input)
    const actor = await requireStaffId('operations:manage')
    if (!actor) return { success: false, error: 'Staff access required.' }
    const result = await reconcileNotificationEmail(actor, data.id, data.reason)
    refreshLeasePages()
    return { success: true, data: { status: result.status } }
  } catch (error) { return { success: false, error: error instanceof LifecycleError ? error.message : 'The provider lookup could not be confirmed. Existing delivery state was preserved.' } }
}
export async function confirmLeaseRequestAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = lifecycleCounterpartySchema.safeExtend({ id: z.uuid(), kind: z.enum(['renewals', 'terminations']) }).parse(input)
    const actor = await requireVerifiedUserId()
    if (!actor) return { success: false, error: 'Sign in to review your lease request.' }
    const decision = { decision: data.decision, reason: data.reason }
    if (data.kind === 'renewals') await confirmRenewal(actor, data.id, decision)
    else await confirmTermination(actor, data.id, decision)
    refreshLeasePages()
    return { success: true, data: undefined }
  } catch (error) { return { success: false, error: error instanceof LifecycleError ? error.message : 'The lease response could not be confirmed. Refresh before trying again.' } }
}

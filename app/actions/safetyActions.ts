'use server'

import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/action-helpers'
import { isAdminId } from '@/lib/operations/access'
import { type ActionResult, PLATFORM_UNAVAILABLE } from '@/lib/platform'
import { appealSafetyNotice, decideSafetyAppeal, issueSafetyNotice, safetyEnabled } from '@/lib/trust/safety'

function revalidateSafety() {
  revalidatePath('/marketplace/appeals')
  revalidatePath('/marketplace/admin')
  revalidatePath('/marketplace/profile', 'layout')
}

export async function issueSafetyNoticeAction(input: unknown): Promise<ActionResult> {
  try {
    if (!safetyEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const actor = await requireUserId()
    if (!actor || !isAdminId(actor)) return { success: false, error: 'Staff access required.' }
    await issueSafetyNotice(actor, input)
    revalidateSafety()
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Notice not issued. Check the evidence, current staff identity and independent-review requirements. A report can only receive one notice.' } }
}

export async function appealSafetyNoticeAction(input: unknown): Promise<ActionResult> {
  try {
    if (!safetyEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const userId = await requireUserId()
    if (!userId) return { success: false, error: 'Sign in to appeal a notice on your account.' }
    await appealSafetyNotice(userId, input)
    revalidateSafety()
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Appeal not submitted. Explain your response in 30–4000 characters. Only the affected account can appeal an active notice, once.' } }
}

export async function decideSafetyAppealAction(input: unknown): Promise<ActionResult> {
  try {
    if (!safetyEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const actor = await requireUserId()
    if (!actor || !isAdminId(actor)) return { success: false, error: 'Staff access required.' }
    await decideSafetyAppeal(actor, input)
    revalidateSafety()
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Decision not saved. Use an independent reviewer with staff access and explain the decision in at least 30 characters.' } }
}

'use server'

import { revalidatePath } from 'next/cache'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { disputeSchema, reviewSchema } from '@/lib/trust/policy'
import { openBookingReport, submitBookingReview } from '@/lib/trust/service'
import { renewalRequestSchema } from '@/lib/lifecycle/policy'
import { requestRenewal } from '@/lib/lifecycle/service'

export async function submitReviewAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = reviewSchema.safeParse(input)
    if (!data.success) return { success: false, error: 'Choose 1–5 stars and write at least 10 characters.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to leave a review.' }
    await submitBookingReview(userId, data.data)
    revalidatePath('/marketplace/bookings'); revalidatePath('/marketplace/profile')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Reviews are available once per participant after a completed booking.' } }
}

export async function openDisputeAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = disputeSchema.safeParse(input)
    if (!data.success) return { success: false, error: 'Explain the issue in 20–4000 characters.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to report a problem.' }
    await openBookingReport(userId, data.data)
    revalidatePath('/marketplace/bookings'); revalidatePath('/marketplace/support')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'A report could not be opened. Check the booking or your existing report and try again.' } }
}

export async function submitRenewalAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = renewalRequestSchema.safeParse(input)
    if (!data.success) return { success: false, error: 'Add the proposed lease end, original reference and supporting receipt or agreement.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to log a renewal.' }
    await requestRenewal(userId, data.data)
    revalidatePath('/marketplace/renewals')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'The extension could not be confirmed. Refresh your lease requests before trying again.' } }
}

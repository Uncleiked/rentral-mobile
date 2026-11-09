'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { paymentsEnabled } from '@/lib/payments/config'
import { startBookingPayment, startListingFeePayment, reconcilePayment } from '@/lib/payments/service'
import type { ActionResult } from '@/lib/platform'

export async function startBookingPaymentAction(bookingId: string): Promise<ActionResult<string>> {
  if (!paymentsEnabled()) return { success: false, error: 'Online payments are being prepared. Your booking remains unpaid.' }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in before paying.' }
    const url = await startBookingPayment(userId, z.string().uuid().parse(bookingId))
    revalidatePath(`/marketplace/bookings/${bookingId}`)
    return { success: true, data: url }
  } catch (error) {
    console.error('[actions/paymentActions] Checkout failed', error instanceof Error ? error.name : 'UnknownError')
    return { success: false, error: 'Checkout could not be opened. Check payment status before trying again.' }
  }
}

export async function reconcilePaymentAction(reference: string): Promise<ActionResult<string>> {
  if (!paymentsEnabled()) return { success: false, error: 'Online payments are not available yet.' }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to continue.' }
    const status = await reconcilePayment(userId, z.string().regex(/^rentral-[a-f0-9-]{36}$/).parse(reference))
    revalidatePath('/marketplace/bookings')
    return { success: true, data: status }
  } catch {
    return { success: false, error: 'Payment status could not be verified. Please try again later; do not pay again.' }
  }
}

export async function startListingFeePaymentAction(listingId: string): Promise<ActionResult<string>> {
  if (!paymentsEnabled()) return { success: false, error: 'Online payments are being prepared. Your listing remains unpaid.' }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in before paying.' }
    const url = await startListingFeePayment(userId, z.string().uuid().parse(listingId))
    revalidatePath('/marketplace/listing')
    return { success: true, data: url }
  } catch {
    return { success: false, error: 'Checkout could not be opened. Check payment status before paying again.' }
  }
}

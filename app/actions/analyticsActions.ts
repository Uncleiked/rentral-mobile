'use server'

import { cookies } from 'next/headers'
import { requireUserId } from '@/lib/action-helpers'
import { insightEventSchema } from '@/lib/analytics/policy'
import { platformEnabled, type ActionResult } from '@/lib/platform'
import { analyticsCollectionEnabled, recordConsentedInsight, setAnalyticsConsent, withdrawAnalyticsHistory } from '@/lib/analytics/service'

export async function setAnalyticsConsentAction(allowed: boolean): Promise<void> {
  if (typeof allowed !== 'boolean') throw new Error('Invalid privacy preference.')
  const userId = await requireUserId()
  if (!userId) throw new Error('Sign in to manage analytics preferences.')
  await setAnalyticsConsent(userId, allowed)
  const jar = await cookies()
  jar.set('rentral-analytics-consent', allowed === true ? 'yes' : 'no', {
    path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 365 * 86400,
  })
}

export async function recordInsightAction(input: unknown): Promise<ActionResult> {
  try {
    if (!analyticsCollectionEnabled() ||
      (await cookies()).get('rentral-analytics-consent')?.value !== 'yes') return { success: true, data: undefined }
    const parsed = insightEventSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Invalid analytics event.' }
    const userId = await requireUserId()
    if (!userId) return { success: true, data: undefined }
    await recordConsentedInsight(userId, parsed.data)
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Analytics event was not recorded.' } }
}

export async function deleteAnalyticsHistoryAction(): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!userId || !platformEnabled()) return { success: false, error: 'Sign in to manage your analytics history.' }
    await withdrawAnalyticsHistory(userId)
    const jar = await cookies()
    jar.set('rentral-analytics-consent', 'no', { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 365 * 86400 })
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Your analytics history could not be removed. Try again.' } }
}

'use server'

import { createHmac } from 'node:crypto'
import { cookies } from 'next/headers'
import { requireUserId } from '@/lib/action-helpers'
import prisma from '@/lib/db'
import { insightEventSchema } from '@/lib/analytics/policy'
import { platformEnabled, type ActionResult } from '@/lib/platform'
import { withTransaction, lockRecord } from '@/lib/database/transactions'

export async function setAnalyticsConsentAction(allowed: boolean): Promise<void> {
  const jar = await cookies()
  jar.set('rentral-analytics-consent', allowed === true ? 'yes' : 'no', {
    path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 365 * 86400,
  })
}

export async function recordInsightAction(input: unknown): Promise<ActionResult> {
  try {
    const secret = process.env.ANALYTICS_HASH_SECRET
    if (!platformEnabled() || process.env.RENTRAL_ANALYTICS_ENABLED !== 'true' || !secret || secret.length < 32 ||
      (await cookies()).get('rentral-analytics-consent')?.value !== 'yes') return { success: true, data: undefined }
    const parsed = insightEventSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Invalid analytics event.' }
    const userId = await requireUserId()
    if (!userId) return { success: true, data: undefined }
    const event = parsed.data
    // Rotate cohort identifiers monthly. No persistent raw user identifiers.
    const month = new Date().toISOString().slice(0, 7)
    const subjectHash = createHmac('sha256', secret).update(`${month}:${userId}`).digest('hex')
    const day = new Date().toISOString().slice(0, 10)
    const dedupeKey = createHmac('sha256', secret).update(JSON.stringify({ subjectHash, day, ...event })).digest('hex')
    await withTransaction(async tx => {
      if (!await lockRecord(tx, 'user', userId)) throw new Error('ACCOUNT_UNAVAILABLE')
      await tx.marketEvent.upsert({ where: { dedupe_key: dedupeKey }, update: {}, create: {
        subject_hash: subjectHash, event_type: event.event, category: event.category, intent: event.intent,
        neighborhood: event.neighborhood, budget_band: event.budgetBand, bedrooms: event.bedrooms, dedupe_key: dedupeKey,
      } })
    })
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Analytics event was not recorded.' } }
}

export async function deleteAnalyticsHistoryAction(): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const secret = process.env.ANALYTICS_HASH_SECRET
    if (!userId || !secret || !platformEnabled()) return { success: false, error: 'Sign in to manage your analytics history.' }
    const hashes = Array.from({ length: 4 }, (_, offset) => {
      const date = new Date(); date.setUTCMonth(date.getUTCMonth() - offset, 1)
      return createHmac('sha256', secret).update(`${date.toISOString().slice(0, 7)}:${userId}`).digest('hex')
    })
    await prisma.marketEvent.deleteMany({ where: { subject_hash: { in: hashes } } })
    await setAnalyticsConsentAction(false)
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Your analytics history could not be removed. Try again.' } }
}

import { createHmac } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { accountIsActive, assertActiveAccounts } from '@/lib/accounts/availability'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { platformEnabled } from '@/lib/platform'
import { insightEventSchema } from './policy'

export const ANALYTICS_RETENTION_DAYS = 90
const tokenSchema = z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/), subject: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const tokensSchema = z.array(tokenSchema).max(64)
type SubjectToken = z.infer<typeof tokenSchema>
export class AnalyticsError extends Error {}

export function analyticsCollectionEnabled(): boolean {
  return platformEnabled() && process.env.RENTRAL_ANALYTICS_ENABLED === 'true' && (process.env.ANALYTICS_HASH_SECRET?.length ?? 0) >= 32
}
function subjectTokens(value: unknown): SubjectToken[] {
  if (value === null || value === undefined) return []
  const parsed = tokensSchema.safeParse(value)
  if (!parsed.success) throw new AnalyticsError('Your analytics settings need review before collection can continue.')
  return parsed.data
}
function legacySubjects(userId: string, secret: string | undefined, now: Date): string[] {
  if (!secret || secret.length < 32) return []
  return Array.from({ length: 4 }, (_, offset) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 7)
    return createHmac('sha256', secret).update(`${month}:${userId}`).digest('hex')
  })
}
function currentSubjects(tokens: SubjectToken[], now: Date): SubjectToken[] {
  const cutoff = now.getTime() - ANALYTICS_RETENTION_DAYS * 86400000
  return tokens.filter(token => new Date(`${token.month}-01T00:00:00.000Z`).getTime() >= cutoff).slice(-64)
}

/** The scheduled lifecycle sweep must call this for inactive/opted-out members too. */
export async function pruneAnalyticsSubjects(userId: string, now = new Date()): Promise<boolean> {
  return withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', userId)) return false
    const user = await tx.user.findUnique({ where: { id: userId }, select: { analytics_subjects: true } })
    if (!user) return false
    const previous = subjectTokens(user.analytics_subjects), retained = currentSubjects(previous, now)
    const keep = new Set(retained.map(token => token.subject))
    const removed = previous.filter(token => !keep.has(token.subject)).map(token => token.subject)
    if (!removed.length) return false
    await tx.marketEvent.deleteMany({ where: { subject_hash: { in: removed } } })
    await tx.user.update({ where: { id: userId }, data: { analytics_subjects: retained } })
    return true
  })
}
export async function analyticsPrivacy(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { analytics_consent: true, analytics_consent_at: true } })
  if (!user) throw new AnalyticsError('Your account is unavailable.')
  return { allowed: user.analytics_consent === true, updatedAt: user.analytics_consent_at?.toISOString() ?? null,
    collectionEnabled: analyticsCollectionEnabled(), retentionDays: ANALYTICS_RETENTION_DAYS }
}
export async function setAnalyticsConsent(userId: string, allowed: boolean): Promise<void> {
  await withTransaction(async tx => {
    if (allowed) await assertActiveAccounts(tx, [userId])
    else if (!await lockRecord(tx, 'user', userId)) throw new AnalyticsError('Your account is unavailable.')
    await tx.user.update({ where: { id: userId }, data: { analytics_consent: allowed, analytics_consent_at: new Date() } })
  })
}

/** The same user write lock serializes collection, opting out and history removal. */
export async function recordConsentedInsight(userId: string, input: unknown): Promise<boolean> {
  if (!analyticsCollectionEnabled()) return false
  const event = insightEventSchema.parse(input)
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    return recordAnalyticsObservationInTransaction(tx, userId, event)
  })
}
export const serverObservationSchema = insightEventSchema.omit({ event: true }).extend({ event: z.enum(['search', 'detail', 'checkout', 'verified_booking', 'sponsored_impression', 'sponsored_click']), campaignId: z.uuid().optional() }).strict()
  .refine(value => value.event.startsWith('sponsored_') ? Boolean(value.campaignId) : !value.campaignId)

/** Internal only: caller holds the user write lock and derives entity context
 * from current authorized domain records. Public event adapters retain their
 * narrower schema and can never select server-confirmed conversion events. */
export async function recordAnalyticsObservationInTransaction(tx: Prisma.TransactionClient, userId: string, input: unknown, sourceKey?: string, occurredAt?: Date): Promise<boolean> {
    if (!analyticsCollectionEnabled()) return false
    const event = serverObservationSchema.parse(input), secret = process.env.ANALYTICS_HASH_SECRET
    if (!secret || secret.length < 32) return false
    if (event.event === 'verified_booking' && !sourceKey) throw new AnalyticsError('Verified observations require a server-bound source.')
    if (event.event === 'verified_booking' && (!occurredAt || !Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now())) throw new AnalyticsError('Verified observations require a valid source time.')
    if (sourceKey) z.string().min(1).max(200).parse(sourceKey)
    const user = await tx.user.findUnique({ where: { id: userId }, select: { closed_at: true, analytics_consent: true, analytics_consent_at: true, analytics_subjects: true } })
    if (!user || !accountIsActive(user)) return false
    if (user.analytics_consent !== true) return false
    // Do not backfill old payment observations after a member opts back in.
    if (occurredAt && user.analytics_consent_at && occurredAt < user.analytics_consent_at) return false
    const now = new Date(), month = now.toISOString().slice(0, 7), day = now.toISOString().slice(0, 10)
    const cutoff = new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 86400000)
    const previous = subjectTokens(user.analytics_subjects)
    // Reuse this month's token across key rotation: one person stays one contributor.
    const subjectHash = previous.find(token => token.month === month)?.subject ?? createHmac('sha256', secret).update(`${month}:${userId}`).digest('hex')
    let verifiedKey: string | null = null
    if (event.event === 'verified_booking' && sourceKey) {
      const sourceDedupe = (subject: string) => createHmac('sha256', subject).update(`verified_booking\0${sourceKey}`).digest('hex')
      const keys = [...new Set([...previous.map(token => sourceDedupe(token.subject)), sourceDedupe(subjectHash)])]
      if (await tx.marketEvent.findFirst({ where: { dedupe_key: { in: keys }, event_type: 'verified_booking' }, select: { id: true } })) return false
      verifiedKey = sourceDedupe(subjectHash)
    }
    const current = previous.some(token => token.subject === subjectHash) ? previous : [...previous, { month, subject: subjectHash }]
    const retained = currentSubjects(current, now)
    const retainedSubjects = new Set(retained.map(token => token.subject))
    const evicted = current.filter(token => !retainedSubjects.has(token.subject)).map(token => token.subject)
    // Delete expired/evicted history before forgetting its rotation-safe mapping.
    if (evicted.length) await tx.marketEvent.deleteMany({ where: { subject_hash: { in: evicted } } })
    await tx.marketEvent.deleteMany({ where: { subject_hash: { in: [...retainedSubjects] }, createdAt: { lt: cutoff } } })
    await tx.user.update({ where: { id: userId }, data: { analytics_subjects: retained } })
    const source = sourceKey ? createHmac('sha256', subjectHash).update(sourceKey).digest('hex') : null
    const dedupeKey = verifiedKey ?? createHmac('sha256', subjectHash).update(JSON.stringify({ day, ...event, ...(source ? { source } : {}) })).digest('hex')
    await tx.marketEvent.upsert({ where: { dedupe_key: dedupeKey }, update: {}, create: {
      subject_hash: subjectHash, event_type: event.event, category: event.category, intent: event.intent,
      neighborhood: event.neighborhood, budget_band: event.budgetBand, bedrooms: event.bedrooms, dedupe_key: dedupeKey,
      ...(event.campaignId ? { campaign_id: event.campaignId } : {}),
    } })
    return true
}
export async function withdrawAnalyticsHistory(userId: string): Promise<void> {
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', userId)) throw new AnalyticsError('Your account is unavailable.')
    await withdrawAnalyticsHistoryInTransaction(tx, userId)
  })
}
/** Caller must already hold the user write lock. Safe for atomic account closure. */
export async function withdrawAnalyticsHistoryInTransaction(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { analytics_subjects: true } })
  if (!user) throw new AnalyticsError('Your account is unavailable.')
  const subjects = [...new Set([...subjectTokens(user.analytics_subjects).map(token => token.subject), ...legacySubjects(userId, process.env.ANALYTICS_HASH_SECRET, new Date())])]
  if (subjects.length) await tx.marketEvent.deleteMany({ where: { subject_hash: { in: subjects } } })
  await tx.user.update({ where: { id: userId }, data: { analytics_consent: false, analytics_consent_at: new Date(), analytics_subjects: [] } })
}

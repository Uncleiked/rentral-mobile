import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { assertLifecycleReady } from '@/lib/database/readiness'

const LEASE_MS = 120000
export type LifecycleJob = 'reservation-expiry' | 'renewal-reminders' | 'termination-release' | 'analytics-retention' | 'notification-email' | 'financial-reconciliation' | 'auth-email-delivery' | 'push-dispatch' | 'push-receipts'
export type WorkerContext = { cursor: Prisma.JsonValue | null; heartbeat: () => Promise<void> }
export const idWorkerCursor = z.object({ id: z.uuid().optional() }).strict()
export const dateWorkerCursor = z.object({ id: z.uuid().optional(), date: z.string().datetime({ offset: true }).optional() }).strict()
  .refine(value => Boolean(value.id) === Boolean(value.date), 'Worker cursor fields must be paired.')

/** A lost worker cannot advance a newer worker's cursor or clear its lease. */
export async function runLeasedJob<T>(job: LifecycleJob, operation: (context: WorkerContext) => Promise<{ result: T; cursor: Prisma.InputJsonObject }>): Promise<T | null> {
  await assertLifecycleReady()
  try { await prisma.workerState.upsert({ where: { id: job }, update: {}, create: { id: job, lease_token: null, lease_expires_at: null } }) }
  catch (error) {
    // Outside a business transaction, two first-start workers may race to create
    // the same stable job record. The following CAS elects the actual winner.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error
  }
  const now = new Date(), token = randomUUID()
  const claimed = await prisma.workerState.updateMany({ where: { id: job, OR: [{ lease_expires_at: null }, { lease_expires_at: { isSet: false } }, { lease_expires_at: { lte: now } }] },
    data: { lease_token: token, lease_expires_at: new Date(now.getTime() + LEASE_MS), last_started_at: now, last_error_code: null, revision: { increment: 1 } } })
  if (claimed.count !== 1) return null
  const heartbeat = async (): Promise<void> => {
    const current = new Date()
    const kept = await prisma.workerState.updateMany({ where: { id: job, lease_token: token, lease_expires_at: { gt: current } },
      data: { lease_expires_at: new Date(current.getTime() + LEASE_MS), revision: { increment: 1 } } })
    if (kept.count !== 1) throw new Error('WORKER_LEASE_LOST')
  }
  try {
    const state = await prisma.workerState.findUniqueOrThrow({ where: { id: job }, select: { cursor: true } })
    const output = await operation({ cursor: state.cursor, heartbeat })
    const completed = await prisma.workerState.updateMany({ where: { id: job, lease_token: token, lease_expires_at: { gt: new Date() } },
      data: { cursor: output.cursor, lease_token: null, lease_expires_at: null, last_completed_at: new Date(), last_error_code: null, revision: { increment: 1 } } })
    if (completed.count !== 1) throw new Error('WORKER_LEASE_LOST')
    return output.result
  } catch (error) {
    await prisma.workerState.updateMany({ where: { id: job, lease_token: token }, data: { lease_token: null, lease_expires_at: null, last_error_code: 'BATCH_FAILED' } }).catch(() => undefined)
    throw error
  }
}

export async function recordWorkerFailure(job: LifecycleJob, targetType: string, targetId: string, code: string): Promise<void> {
  await assertLifecycleReady()
  const id = createHash('sha256').update(`${job}\0${targetType}\0${targetId}`).digest('hex')
  await prisma.workerFailure.upsert({ where: { id }, create: { id, job, target_type: targetType, target_id: targetId, error_code: code, attempts: 1 },
    update: { status: 'open', error_code: code, attempts: { increment: 1 }, last_occurred_at: new Date(), resolved_by: null, resolved_at: null, resolution: null } })
}

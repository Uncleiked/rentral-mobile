import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { traceTransaction } from './transaction-trace'
import { databaseErrorDiagnostic } from './error-diagnostics'
import { lockRecordRevision, type RevisionLockModel } from './revision-lock'

export type LockModel = RevisionLockModel
const TRANSACTION_ATTEMPTS = 5
const TRANSACTION_BUDGET_MS = 15000
const TRANSACTION_MAX_WAIT_MS = 5000
const TRANSACTION_TIMEOUT_MS = 10000

function retryableTransaction(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034'
}

/** Retry only database conflicts. Keep network calls and external side effects outside the callback. */
export async function withTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const deadline = Date.now() + TRANSACTION_BUDGET_MS
  let lastConflict: unknown
  for (let attempt = 0; ; attempt += 1) {
    const remaining = deadline - Date.now()
    // A delayed retry must not start another transaction after its total budget.
    if (remaining < 2) throw lastConflict ?? new Error('TRANSACTION_DEADLINE_EXCEEDED')
    const maxWait = Math.min(TRANSACTION_MAX_WAIT_MS, Math.floor(remaining / 2))
    const timeout = Math.min(TRANSACTION_TIMEOUT_MS, remaining - maxWait)
    try {
      return await traceTransaction(async snapshot => {
        const started = Date.now()
        try {
          return await prisma.$transaction(tx => {
            // This query-only extension preserves inputs/results/readiness.
            return operation(tx as unknown as Prisma.TransactionClient)
          }, { maxWait, timeout })
        } catch (error) {
          const diagnostic = databaseErrorDiagnostic(error)
          if (diagnostic.code === 'P2028') console.error('[database/transaction]', { ...diagnostic, elapsedMs: Date.now() - started, maxWait, timeout, steps: snapshot() })
          throw error
        }
      })
    }
    catch (error) {
      if (!retryableTransaction(error) || attempt + 1 >= TRANSACTION_ATTEMPTS) throw error
      lastConflict = error
      const pause = 100 * 2 ** attempt + Math.floor(Math.random() * 50)
      if (Date.now() + pause >= deadline) throw error
      await new Promise<void>(resolve => setTimeout(resolve, pause))
    }
  }
}

/** A real write serializes competing transactions; reading or setting an unchanged value does not. */
export async function lockRecord(tx: Prisma.TransactionClient, model: LockModel, id: string): Promise<boolean> {
  return lockRecordRevision(tx, model, id)
}

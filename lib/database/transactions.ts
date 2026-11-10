import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'

export type LockModel = 'user' | 'listing' | 'listingCapture' | 'booking' | 'paymentIntent' | 'mediaAsset' | 'dispute' | 'safetyNotice' | 'safetyAppeal' | 'renewal' | 'leaseTermination' | 'workerState' | 'paymentRecipient' | 'financialOperation' | 'providerReceipt' | 'matchProfile' | 'matchConnection' | 'matchReport' | 'commercialOrder' | 'sponsoredCampaign' | 'pushDevice' | 'pushDelivery'
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
      return await prisma.$transaction(tx => {
        // This query-only extension changes no delegates, inputs or results. Erase
        // its internal generic metadata at this one boundary; guards remain active.
        return operation(tx as unknown as Prisma.TransactionClient)
      }, { maxWait, timeout })
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
  const args = { where: { id }, data: { revision: { increment: 1 } } }
  switch (model) {
    case 'user': return (await tx.user.updateMany(args)).count === 1
    case 'listing': return (await tx.listing.updateMany(args)).count === 1
    case 'listingCapture': return (await tx.listingCapture.updateMany(args)).count === 1
    case 'booking': return (await tx.booking.updateMany(args)).count === 1
    case 'paymentIntent': return (await tx.paymentIntent.updateMany(args)).count === 1
    case 'mediaAsset': return (await tx.mediaAsset.updateMany(args)).count === 1
    case 'dispute': return (await tx.dispute.updateMany(args)).count === 1
    case 'safetyNotice': return (await tx.safetyNotice.updateMany(args)).count === 1
    case 'safetyAppeal': return (await tx.safetyAppeal.updateMany(args)).count === 1
    case 'renewal': return (await tx.renewal.updateMany(args)).count === 1
    case 'leaseTermination': return (await tx.leaseTermination.updateMany(args)).count === 1
    case 'workerState': return (await tx.workerState.updateMany(args)).count === 1
    case 'paymentRecipient': return (await tx.paymentRecipient.updateMany(args)).count === 1
    case 'financialOperation': return (await tx.financialOperation.updateMany(args)).count === 1
    case 'providerReceipt': return (await tx.providerReceipt.updateMany(args)).count === 1
    case 'matchProfile': return (await tx.matchProfile.updateMany(args)).count === 1
    case 'matchConnection': return (await tx.matchConnection.updateMany(args)).count === 1
    case 'matchReport': return (await tx.matchReport.updateMany(args)).count === 1
    case 'commercialOrder': return (await tx.commercialOrder.updateMany(args)).count === 1
    case 'sponsoredCampaign': return (await tx.sponsoredCampaign.updateMany(args)).count === 1
    case 'pushDevice': return (await tx.pushDevice.updateMany(args)).count === 1
    case 'pushDelivery': return (await tx.pushDelivery.updateMany(args)).count === 1
  }
}

import type { Prisma } from '@prisma/client'

type Entry = { account_key: string; direction: string; amount_kobo: bigint; currency: string }
type Collection = { payment_id: string; currency: string; kind: string; business_key?: string; operation_id?: string; entries: Entry[] }
const MAX_SIGNED_LONG = BigInt('9223372036854775807')

export function validateBalancedLedger(input: Collection): void {
  if (!input.payment_id || input.currency !== 'NGN' || input.entries.length < 2) throw new Error('A ledger transaction needs a payment and balanced NGN entries.')
  let debits = BigInt(0), credits = BigInt(0)
  for (const entry of input.entries) {
    if (!entry.account_key || entry.currency !== input.currency || !['debit', 'credit'].includes(entry.direction) ||
      typeof entry.amount_kobo !== 'bigint' || entry.amount_kobo <= BigInt(0) || entry.amount_kobo > MAX_SIGNED_LONG) throw new Error('Invalid ledger entry.')
    if (entry.direction === 'debit') debits += entry.amount_kobo
    else credits += entry.amount_kobo
  }
  if (debits !== credits || debits > MAX_SIGNED_LONG) throw new Error('Ledger entries must balance exactly in one currency.')
}

/** Insert once inside the same transaction as its provider receipt. No mutation API is exposed. */
export async function insertBalancedLedger(tx: Prisma.TransactionClient, input: Collection): Promise<void> {
  validateBalancedLedger(input)
  await tx.ledgerTransaction.create({ data: { payment_id: input.payment_id, currency: input.currency, kind: input.kind,
    business_key: input.business_key ?? `${input.kind}:${input.payment_id}`, ...(input.operation_id ? { operation_id: input.operation_id } : {}),
    entries: { create: input.entries } } })
}

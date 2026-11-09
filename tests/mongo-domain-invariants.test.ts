import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { bookingWindowAvailable } from '@/lib/bookings/availability'
import { insertBalancedLedger, validateBalancedLedger } from '@/lib/payments/ledger'

describe('Mongo reservation availability', () => {
  const booking = { id: 'candidate', listing_id: 'asset', kind: 'rental', starts_at: new Date('2030-02-01T12:00Z'), ends_at: new Date('2030-02-03T12:00Z') }
  it('preserves a disputed reservation and checks a half-open interval under the owner transaction', async () => {
    const findFirst = vi.fn(async () => ({ id: 'disputed-reservation' }))
    const tx = { booking: { findFirst } } as unknown as Prisma.TransactionClient
    expect(await bookingWindowAvailable(tx, booking)).toBe(false)
    expect(findFirst).toHaveBeenCalledWith({ where: {
      id: { not: 'candidate' }, listing_id: 'asset', kind: { in: ['rental', 'hold'] },
      status: { in: ['awaiting_payment', 'confirmed', 'disputed'] }, starts_at: { lt: booking.ends_at }, ends_at: { gt: booking.starts_at },
    }, select: { id: true } })
  })
  it('allows an available interval and exempts inspections from rental overlap rules', async () => {
    const findFirst = vi.fn(async () => null)
    const tx = { booking: { findFirst } } as unknown as Prisma.TransactionClient
    expect(await bookingWindowAvailable(tx, booking)).toBe(true)
    findFirst.mockClear()
    expect(await bookingWindowAvailable(tx, { ...booking, kind: 'inspection' })).toBe(true)
    expect(findFirst).not.toHaveBeenCalled()
    expect(await bookingWindowAvailable(tx, { ...booking, ends_at: booking.starts_at })).toBe(false)
  })
})

describe('Mongo ledger insert boundary', () => {
  const debit = { account_key: 'provider:collections', direction: 'debit', amount_kobo: BigInt(9007199254740991), currency: 'NGN' }
  const credit = { ...debit, account_key: 'customer:unsettled', direction: 'credit' }
  const input = { payment_id: 'payment', currency: 'NGN', kind: 'provider_collection', entries: [debit, credit] }
  it('inserts large integer kobo without converting through floating-point money', async () => {
    const create = vi.fn()
    const tx = { ledgerTransaction: { create } } as unknown as Prisma.TransactionClient
    await insertBalancedLedger(tx, input)
    expect(create).toHaveBeenCalledWith({ data: { payment_id: 'payment', currency: 'NGN', kind: 'provider_collection', entries: { create: [debit, credit] } } })
  })
  it.each([
    { ...input, entries: [debit] },
    { ...input, entries: [debit, { ...credit, amount_kobo: BigInt(1) }] },
    { ...input, entries: [debit, { ...credit, currency: 'USD' }] },
    { ...input, entries: [{ ...debit, amount_kobo: BigInt(0) }, credit] },
    { ...input, entries: [{ ...debit, amount_kobo: BigInt(-1) }, credit] },
    { ...input, entries: [{ ...debit, amount_kobo: BigInt('9223372036854775808') }, { ...credit, amount_kobo: BigInt('9223372036854775808') }] },
  ])('rejects unbalanced, mixed or unsupported money before persistence', async invalid => {
    const create = vi.fn()
    const tx = { ledgerTransaction: { create } } as unknown as Prisma.TransactionClient
    expect(() => validateBalancedLedger(invalid)).toThrow()
    await expect(insertBalancedLedger(tx, invalid)).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })
})

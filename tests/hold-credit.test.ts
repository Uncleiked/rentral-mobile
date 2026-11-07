import { describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { allocateHoldCredit, bookingPayableKobo, holdCreditTerms, holdCreditCanConfirm, reviewHoldCredit } from '@/lib/bookings/hold-credit'

const now = new Date('2030-01-01T12:00:00Z')
const starts_at = new Date('2030-02-01T12:00:00Z'), ends_at = new Date('2030-02-03T12:00:00Z')
const holdId = 'a727d7b3-2148-43e4-86df-a0717569fec4'
const hold = { id: holdId, listing_id: 'listing', seeker_id: 'renter', lister_id: 'host', kind: 'hold', status: 'confirmed', currency: 'NGN',
  amount_kobo: BigInt(2000000), settlement_status: 'unsettled', expires_at: new Date('2030-01-02T12:00:00Z'), starts_at, ends_at }
const rental = { ...hold, id: 'rental', kind: 'rental', status: 'requested', amount_kobo: BigInt(10000000), expires_at: null,
  pricing_snapshot: { period: 'day', days: 2, baseKobo: '10000000', totalKobo: '10000000', fees: [], holdBookingId: holdId } }
const payment = { user_id: 'renter', status: 'succeeded', amount_kobo: BigInt(2000000), currency: 'NGN', paid_at: new Date('2030-01-01T11:00:00Z') }

describe('one-time holding credit', () => {
  it('allocates integer kobo and caps the balance deadline to the original hold', () => {
    expect(holdCreditTerms(hold, rental, [payment], now)).toEqual({ creditKobo: BigInt(2000000), payableKobo: BigInt(8000000), expiresAt: new Date('2030-01-01T12:30:00Z') })
    expect(holdCreditTerms({ ...hold, expires_at: new Date('2030-01-01T12:05:00Z') }, rental, [payment], now).expiresAt).toEqual(new Date('2030-01-01T12:05:00Z'))
    expect(bookingPayableKobo({ amount_kobo: BigInt(9007199254740991), hold_credit_kobo: BigInt(2000000) })).toBe(BigInt(9007199252740991))
  })
  it.each([
    { expires_at: now }, { status: 'expired' }, { status: 'converted' }, { settlement_status: 'requires_review' },
    { seeker_id: 'other' }, { lister_id: 'other' }, { listing_id: 'other' }, { currency: 'USD' }, { starts_at: now }, { ends_at: now },
  ])('rejects expired, disputed, reused or mismatched sources: %j', patch => {
    expect(() => holdCreditTerms({ ...hold, ...patch }, rental, [payment], now)).toThrow('cannot fund')
  })
  it.each([
    [], [{ ...payment, status: 'pending' }], [{ ...payment, amount_kobo: BigInt(1) }], [{ ...payment, user_id: 'other' }],
    [{ ...payment, paid_at: null }], [payment, payment], [payment, { ...payment, status: 'requires_review' }],
  ].map(payments => ({ payments })))('requires one exact verified source collection', ({ payments }) => {
    expect(() => holdCreditTerms(hold, rental, payments, now)).toThrow('reconciliation')
  })
  it('refuses excess credit instead of pretending an excess refund happened', () => {
    expect(() => holdCreditTerms(hold, { ...rental, amount_kobo: BigInt(1000000) }, [payment], now)).toThrow('exceeds')
    expect(() => bookingPayableKobo({ amount_kobo: BigInt(1), hold_credit_kobo: BigInt(2) })).toThrow('reconciliation')
  })
  it('marks the source converted only during allocation and rejects reuse', async () => {
    const update = vi.fn(), create = vi.fn()
    const source = { ...hold, payments: [payment], allocated_hold_credit: null as object | null }
    const tx = { $queryRaw: vi.fn(), booking: { findUnique: vi.fn(async () => source), update }, user: { findFirst: vi.fn(async () => ({ id: 'renter' })) }, holdCreditAllocation: { create } } as unknown as Prisma.TransactionClient
    const allocation = await allocateHoldCredit(tx, rental, now)
    expect(update).toHaveBeenCalledWith({ where: { id: holdId }, data: { status: 'converted' } })
    expect(create).toHaveBeenCalledWith({ data: { hold_booking_id: holdId, rental_booking_id: 'rental', amount_kobo: BigInt(2000000), currency: 'NGN' } })
    expect(allocation).toMatchObject({ status: 'awaiting_payment', hold_credit_kobo: BigInt(2000000), pricing_snapshot: { totalKobo: '10000000', holdCreditKobo: '2000000', payableKobo: '8000000' } })
    source.allocated_hold_credit = { id: 'allocated' }
    await expect(allocateHoldCredit(tx, rental, now)).rejects.toThrow('already been allocated')
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('confirms a fully funded rental without requesting a zero-amount provider payment', async () => {
    const tx = { $queryRaw: vi.fn(), booking: { findUnique: vi.fn(async () => ({ ...hold, payments: [payment], allocated_hold_credit: null })), update: vi.fn() }, user: { findFirst: vi.fn(async () => ({ id: 'renter' })) }, holdCreditAllocation: { create: vi.fn() } } as unknown as Prisma.TransactionClient
    expect(await allocateHoldCredit(tx, { ...rental, amount_kobo: hold.amount_kobo, pricing_snapshot: { ...rental.pricing_snapshot, totalKobo: '2000000' } }, now)).toMatchObject({ status: 'confirmed', expires_at: null, pricing_snapshot: { payableKobo: '0' } })
  })
  it('routes cancelled/expired conversion funds to review without deleting the allocation', async () => {
    const updateMany = vi.fn()
    const tx = { holdCreditAllocation: { findUnique: vi.fn(async () => ({ hold_booking_id: holdId, rental_booking_id: rental.id })) }, booking: { updateMany } } as unknown as Prisma.TransactionClient
    await reviewHoldCredit(tx, rental.id)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: [holdId, rental.id] } }, data: { settlement_status: 'requires_review' } })
  })
  it('rechecks the original source before confirming additional money', async () => {
    const source = { ...hold, status: 'converted', payments: [payment] }
    const tx = { holdCreditAllocation: { findUnique: vi.fn(async () => ({ amount_kobo: hold.amount_kobo, hold_booking: source })) } } as unknown as Prisma.TransactionClient
    const target = { ...rental, status: 'awaiting_payment', hold_credit_kobo: hold.amount_kobo }
    expect(await holdCreditCanConfirm(tx, target, now)).toBe(true)
    expect(await holdCreditCanConfirm(tx, target, hold.expires_at)).toBe(false)
    source.settlement_status = 'requires_review'
    expect(await holdCreditCanConfirm(tx, target, now)).toBe(false)
  })
})

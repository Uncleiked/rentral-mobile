import { createHmac, randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { insertBalancedLedger } from '@/lib/payments/ledger'
import { availableFunds } from '@/lib/payments/financial-core'
import { decideFinancialOperation, disablePaymentRecipient, getFinancialPayment, getFinancialWorkspace, requestFinancialOperation, setupPaymentRecipient } from '@/lib/payments/financial'
import { executeFinancialOperation, finalizeFinancialTransfer, reconcileFinancialOperation } from '@/lib/payments/financial-execution'
import { ingestProviderReceipt, processProviderReceipt, runFinancialReconciliationBatch } from '@/lib/payments/financial-receipts'
import { normalizePaystackWebhook } from '@/lib/payments/providers/paystack/webhooks'

const uri = process.env.RENTRAL_TEST_MONGO_URI, owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)
const reason = 'Independent fixture review with preserved exact source funds.'
const hashSecret = 'owned-fixture-bank-hash-secret-at-least-32-bytes'
let serial = 100000

fixture('owned financial provider/domain fixture', () => {
  let native: MongoClient
  const transfers = new Map<string, { id: number; reference: string; amount: number; status: string; recipient: string }>()
  const refunds = new Map<string, { id: number; reference: string; amount: number; status: string; transaction: string }>()
  const bankRecipients = new Map<string, { id: number; code: string }>()
  let transferResult = 'success', refundResult = 'processed', loseRefundAcknowledgement = false, failRefundBeforeAcceptance = false
  let finalizeGate: Promise<void> | null = null, finalizeStarted: (() => void) | null = null
  let recipientGate: Promise<void> | null = null, recipientStarted: (() => void) | null = null, loseRecipientAcknowledgement = false
  let rejectRefund = false
  const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = []

  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}`
      || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Use only the owned Mongo fixture runner.')
    native = new MongoClient(localMongoUrl(uri), { serverSelectionTimeoutMS: 3000 })
    await native.connect()
    const db = native.db(localMongoDatabaseName(uri))
    if (!await db.collection<{ _id: string }>('_FixtureOwnership').findOne({ _id: owner })) throw new Error('Owned fixture marker missing.')
    await ensureMongoIndexes(db)
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture')
    vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test'); vi.stubEnv('SETTLEMENT_ENABLED', 'true'); vi.stubEnv('SETTLEMENT_POLICY_ACK', 'manual-review-v1')
    vi.stubEnv('PAYSTACK_TRANSFERS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_REFUNDS_ENABLED', 'true'); vi.stubEnv('PAYMENT_ACCOUNT_HASH_SECRET', hashSecret)
  }, 20000)
  afterAll(async () => { await prisma.$disconnect(); await closeMongoReadiness(); await native?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  beforeEach(() => {
    transfers.clear(); refunds.clear(); bankRecipients.clear(); calls.length = 0
    transferResult = 'success'; refundResult = 'processed'; loseRefundAcknowledgement = false; failRefundBeforeAcceptance = false
    finalizeGate = null; finalizeStarted = null
    recipientGate = null; recipientStarted = null; loseRecipientAcknowledgement = false; rejectRefund = false
    vi.stubEnv('SETTLEMENT_HOLD_DEFAULT_POLICY', '')
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input), method = init.method ?? 'GET', body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
      if (url.origin !== 'https://api.paystack.co' || init.redirect !== 'error') throw new Error('Unexpected fixture transport.')
      calls.push({ path: `${url.pathname}${url.search}`, method, body })
      const ok = (data: unknown) => Response.json({ status: true, data })
      if (url.pathname === '/bank/resolve' && method === 'GET') return ok({ account_number: url.searchParams.get('account_number'), account_name: 'Owned Fixture Bank' })
      if (url.pathname === '/transferrecipient' && method === 'POST' && body) {
        const key = `${body.bank_code}:${body.account_number}`
        const existing = bankRecipients.get(key) ?? { id: serial++, code: `RCP_owned${serial}` }
        bankRecipients.set(key, existing)
        recipientStarted?.()
        if (recipientGate) await recipientGate
        if (loseRecipientAcknowledgement) throw new Error('Fixture lost nonfinancial recipient acknowledgement.')
        return ok({ id: existing.id, domain: 'test', recipient_code: existing.code, active: true, is_deleted: false, currency: 'NGN', type: 'nuban',
          details: { account_number: String(body.account_number), account_name: null, bank_code: String(body.bank_code) } })
      }
      if (url.pathname.startsWith('/transferrecipient/') && method === 'GET') return ok({ id: 4, domain: 'test', recipient_code: url.pathname.split('/').at(-1),
        active: true, is_deleted: false, currency: 'NGN', type: 'nuban', details: { account_number: '0123456789', account_name: null, bank_code: '058' } })
      if (url.pathname === '/transfer' && method === 'POST' && body) {
        const value = { id: serial++, reference: String(body.reference), amount: Number(body.amount), status: transferResult, recipient: String(body.recipient) }
        transfers.set(value.reference, value)
        return ok({ ...value, domain: 'test', currency: 'NGN', transfer_code: `TRF_${value.id}`, recipient: 4 })
      }
      if (url.pathname.startsWith('/transfer/verify/') && method === 'GET') {
        const value = transfers.get(decodeURIComponent(url.pathname.split('/').at(-1)!))
        return value ? ok({ ...value, domain: 'test', currency: 'NGN', transfer_code: `TRF_${value.id}`, recipient: { recipient_code: value.recipient } }) : new Response('{}', { status: 404 })
      }
      if (url.pathname === '/transfer/finalize_transfer' && method === 'POST' && body) {
        finalizeStarted?.()
        if (finalizeGate) await finalizeGate
        const value = [...transfers.values()].find(row => `TRF_${row.id}` === body.transfer_code)!
        value.status = 'success'
        return ok({ ...value, domain: 'test', currency: 'NGN', transfer_code: `TRF_${value.id}`, recipient: 4 })
      }
      if (url.pathname === '/refund' && method === 'POST' && body) {
        if (rejectRefund) return new Response('PRIVATE provider rejection', { status: 400 })
        if (failRefundBeforeAcceptance) throw new Error('Fixture disconnected before any known acknowledgement.')
        const value = { id: serial++, reference: String(body.reference), amount: Number(body.amount), status: refundResult, transaction: String(body.transaction) }
        refunds.set(value.reference, value)
        if (loseRefundAcknowledgement) throw new Error('Fixture lost acknowledgement after provider acceptance.')
        return ok({ ...value, domain: 'test', currency: 'NGN' })
      }
      if (url.pathname === '/refund' && method === 'GET') {
        const value = refunds.get(url.searchParams.get('reference')!)
        return ok(value ? [{ ...value, domain: 'test', currency: 'NGN' }] : [])
      }
      throw new Error('Unimplemented owned fixture transport; no network calls are permitted.')
    }))
  })

  async function user(role?: string) { const id = randomUUID(); return prisma.user.create({ data: { id, email: `${id}@fixture.invalid`, staff_role: role ?? null } }) }
  async function source(options: { kind?: string; amount?: bigint; status?: string; hostRole?: string } = {}) {
    const [host, renter, staff] = await Promise.all([user(options.hostRole), user(), user('finance')])
    const listing = await prisma.listing.create({ data: { lister_id: host.id, category: 'car', listing_status: 'active', base_rent_amount: 1000 } })
    const amount = options.amount ?? BigInt(100000)
    const booking = await prisma.booking.create({ data: { listing_id: listing.id, seeker_id: renter.id, lister_id: host.id, kind: options.kind ?? 'rental',
      status: options.status ?? 'completed', starts_at: new Date(Date.now() - 172800000), ends_at: new Date(Date.now() - 86400000), expires_at: new Date(Date.now() - 3600000),
      amount_kobo: amount, currency: 'NGN', seeker_checked_in_at: new Date(), lister_checked_in_at: new Date(), settlement_status: options.kind === 'hold' ? 'requires_review' : 'unsettled' } })
    const payment = await prisma.paymentIntent.create({ data: { booking_id: booking.id, user_id: renter.id, kind: 'booking', status: 'succeeded', reference: `fixture-${randomUUID()}`,
      idempotency_key: randomUUID(), amount_kobo: amount, customer_email: renter.email, provider_environment: 'test', provider_transaction_id: String(serial++), paid_at: new Date() } })
    await withTransaction(tx => insertBalancedLedger(tx, { payment_id: payment.id, kind: 'provider_collection', currency: 'NGN', entries: [
      { account_key: 'provider:paystack:collections', direction: 'debit', amount_kobo: amount, currency: 'NGN' },
      { account_key: `customer:${renter.id}:unsettled`, direction: 'credit', amount_kobo: amount, currency: 'NGN' },
    ] }))
    const recipient = await prisma.paymentRecipient.create({ data: { user_id: host.id, provider_environment: 'test', provider_code: `RCP_${randomUUID().replaceAll('-', '')}`, bank_code: '058',
      account_last4: '6789', account_fingerprint: createHmac('sha256', hashSecret).update('paystack:test:058:0123456789').digest('hex'), status: 'active', resolved_at: new Date() } })
    return { host, renter, staff, listing, booking, payment, recipient }
  }
  async function refundRequest(value: Awaited<ReturnType<typeof source>>, amount = '40000', clientId = randomUUID()) {
    return requestFinancialOperation(value.renter.id, { clientId, kind: 'refund', paymentId: value.payment.id, amountKobo: amount, reason })
  }
  async function payoutRequest(value: Awaited<ReturnType<typeof source>>, amount = '40000', policyVersion = 'standard-v1') {
    return requestFinancialOperation(value.host.id, { clientId: randomUUID(), kind: 'payout', bookingId: value.booking.id, recipientId: value.recipient.id, amountKobo: amount, reason, policyVersion })
  }

  it('serializes competing partial reservations without overspending one collected source', async () => {
    const value = await source()
    const results = await Promise.allSettled([refundRequest(value, '60000'), refundRequest(value, '60000')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.financialAllocation.aggregate({ where: { payment_id: value.payment.id }, _sum: { amount_kobo: true } })).toMatchObject({ _sum: { amount_kobo: BigInt(60000) } })
    expect(await withTransaction(tx => availableFunds(tx, value.payment))).toBe(BigInt(40000))
  })
  it('reuses exact request IDs concurrently and rejects changing an already recorded instruction', async () => {
    const value = await source(), clientId = randomUUID()
    const [first, duplicate] = await Promise.all([refundRequest(value, '40000', clientId), refundRequest(value, '40000', clientId)])
    expect(first.id).toBe(duplicate.id)
    await expect(refundRequest(value, '30000', clientId)).rejects.toMatchObject({ code: 'INVALID_RETRY' })
    expect(await prisma.financialAllocation.count({ where: { operation_id: first.id } })).toBe(1)
  })
  it('requires approval independent of both requester and booking parties with current server roles', async () => {
    const value = await source({ hostRole: 'finance' })
    const operation = await refundRequest(value)
    await expect(decideFinancialOperation(value.host.id, operation.id, 'approve', reason)).rejects.toMatchObject({ code: 'INDEPENDENT_APPROVAL_REQUIRED' })
    expect((await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)).status).toBe('approved')
    await prisma.user.update({ where: { id: value.staff.id }, data: { staff_role: null } })
    const otherStaff = await user('finance')
    await expect(executeFinancialOperation(otherStaff.id, operation.id)).rejects.toThrow('Staff access required.')
    expect(calls.some(call => call.method === 'POST')).toBe(false)
  })
  it('keeps request/history and withdrawal review available while all provider mutation flags are off', async () => {
    const value = await source()
    vi.stubEnv('PAYSTACK_SECRET_KEY', ''); vi.stubEnv('SETTLEMENT_ENABLED', 'false')
    try {
      const operation = await refundRequest(value)
      expect((await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)).status).toBe('approved')
      const view = await getFinancialWorkspace(value.renter.id)
      expect(view.operations.some(row => row.id === operation.id)).toBe(true)
      expect(view.settlementAvailable).toBe(false)
      expect((await decideFinancialOperation(value.renter.id, operation.id, 'reject', reason)).status).toBe('rejected')
      expect(calls).toHaveLength(0)
    } finally { vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture'); vi.stubEnv('SETTLEMENT_ENABLED', 'true') }
  })
  it('persists only masked/keyed recipient setup and recovers an acknowledgement loss by explicit same-account setup', async () => {
    const account = await user()
    loseRecipientAcknowledgement = true
    await expect(setupPaymentRecipient(account.id, { accountNumber: '0123456789', bankCode: '058' })).rejects.toMatchObject({ uncertain: true })
    const pending = await prisma.paymentRecipient.findFirstOrThrow({ where: { user_id: account.id } })
    expect(pending.status).toBe('uncertain')
    expect(JSON.stringify(pending)).not.toContain('0123456789')
    loseRecipientAcknowledgement = false
    const recipient = await setupPaymentRecipient(account.id, { accountNumber: '0123456789', bankCode: '058' })
    expect(recipient).toMatchObject({ id: pending.id, status: 'active', accountLast4: '6789', environment: 'test' })
    expect(await prisma.paymentRecipient.count({ where: { user_id: account.id } })).toBe(1)
  })
  it('never reactivates a recipient disabled by its owner while provider acknowledgement is in flight', async () => {
    const account = await user()
    let release: () => void = () => undefined
    recipientGate = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { recipientStarted = resolve })
    const setup = setupPaymentRecipient(account.id, { accountNumber: '0123456789', bankCode: '058' })
    await entered
    const pending = await prisma.paymentRecipient.findFirstOrThrow({ where: { user_id: account.id } })
    await disablePaymentRecipient(account.id, pending.id)
    release()
    await expect(setup).rejects.toMatchObject({ code: 'RECIPIENT_SETUP_INTERRUPTED' })
    expect(await prisma.paymentRecipient.findUnique({ where: { id: pending.id } })).toMatchObject({ status: 'disabled' })
  })
  it('posts a verified payout and its reversal once while preserving immutable allocation/history', async () => {
    const value = await source(), operation = await payoutRequest(value)
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('succeeded')
    await reconcileFinancialOperation(value.host.id, operation.id)
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(1)
    transfers.get(operation.reference)!.status = 'reversed'
    await reconcileFinancialOperation(value.host.id, operation.id); await reconcileFinancialOperation(value.host.id, operation.id)
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(2)
    expect(await prisma.financialAllocation.count({ where: { operation_id: operation.id } })).toBe(1)
    expect(await withTransaction(tx => availableFunds(tx, value.payment))).toBe(value.payment.amount_kobo)
    expect(calls.filter(call => call.method === 'POST' && call.path === '/transfer')).toHaveLength(1)
  })
  it('posts partial refunds exactly once and recovers accepted POST acknowledgements by the same reference', async () => {
    const value = await source(), operation = await refundRequest(value, '25000')
    loseRefundAcknowledgement = true
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('succeeded')
    await reconcileFinancialOperation(value.renter.id, operation.id)
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(1)
    expect(calls.filter(call => call.method === 'POST' && call.path === '/refund')).toHaveLength(1)
    expect(await withTransaction(tx => availableFunds(tx, value.payment))).toBe(BigInt(75000))
  })
  it('keeps unknown provider submissions reserved and never automatically repeats their POST', async () => {
    const value = await source(), operation = await refundRequest(value)
    failRefundBeforeAcceptance = true
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('uncertain')
    await expect(executeFinancialOperation(value.staff.id, operation.id)).rejects.toMatchObject({ code: 'RECONCILE_REQUIRED' })
    expect(await withTransaction(tx => availableFunds(tx, value.payment))).toBe(BigInt(60000))
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1)
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(0)
  })
  it('releases only definitively rejected instructions while preserving their failed history and original reference', async () => {
    const value = await source(), operation = await refundRequest(value)
    rejectRefund = true
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('failed')
    expect(await withTransaction(tx => availableFunds(tx, value.payment))).toBe(value.payment.amount_kobo)
    await expect(executeFinancialOperation(value.staff.id, operation.id)).rejects.toMatchObject({ code: 'RECONCILE_REQUIRED' })
    expect(calls.filter(call => call.method === 'POST' && call.path === '/refund')).toHaveLength(1)
  })
  it('keeps OTP transfers action-required and posts only after finalization plus GET verification', async () => {
    const value = await source(), operation = await payoutRequest(value)
    transferResult = 'otp'
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('requires_action')
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(0)
    expect((await finalizeFinancialTransfer(value.staff.id, operation.id, '123456')).status).toBe('succeeded')
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(1)
    expect(JSON.stringify(await prisma.financialOperation.findUnique({ where: { id: operation.id } }), (_key, item) => typeof item === 'bigint' ? item.toString() : item)).not.toContain('123456')
  })
  it('records real late provider success once but quarantines source reallocation instead of spending it twice', async () => {
    const value = await source(), first = await refundRequest(value, '40000')
    rejectRefund = true
    await decideFinancialOperation(value.staff.id, first.id, 'approve', reason)
    await executeFinancialOperation(value.staff.id, first.id)
    const second = await refundRequest(value, '100000')
    refunds.set(first.reference, { id: serial++, reference: first.reference, amount: 40000, status: 'processed', transaction: value.payment.provider_transaction_id! })
    await reconcileFinancialOperation(value.renter.id, first.id)
    await reconcileFinancialOperation(value.renter.id, first.id)
    expect(await prisma.financialOperation.findUnique({ where: { id: first.id } })).toMatchObject({ status: 'uncertain', failure_code: 'SOURCE_OVERALLOCATED' })
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: first.id } })).toBe(1)
    await expect(decideFinancialOperation(value.staff.id, second.id, 'approve', reason)).rejects.toMatchObject({ code: 'FUNDS_RESERVED' })
    expect(calls.filter(call => call.method === 'POST' && call.path === '/refund')).toHaveLength(1)
  }, 15000)
  it('gates reviewed hold-default disposition and records exact 70/30 retention with compensating reversal', async () => {
    const value = await source({ kind: 'hold', status: 'expired', amount: BigInt(10001) })
    await expect(payoutRequest(value, '7001', '30-70-v1')).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' })
    vi.stubEnv('SETTLEMENT_HOLD_DEFAULT_POLICY', '30-70-v1')
    const operation = await payoutRequest(value, '7001', '30-70-v1')
    expect(operation.retainedKobo).toBe('3000')
    expect((await prisma.financialAllocation.findFirstOrThrow({ where: { operation_id: operation.id } })).amount_kobo).toBe(BigInt(10001))
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('succeeded')
    const journal = await prisma.ledgerTransaction.findFirstOrThrow({ where: { operation_id: operation.id }, include: { entries: true } })
    expect(journal.entries.map(entry => [entry.direction, entry.amount_kobo.toString()]).sort()).toEqual([['credit', '3000'], ['credit', '7001'], ['debit', '10001']])
    expect(calls.find(call => call.method === 'POST' && call.path === '/transfer')?.body?.amount).toBe(7001)
    transfers.get(operation.reference)!.status = 'reversed'
    await reconcileFinancialOperation(value.host.id, operation.id)
    expect(await prisma.ledgerEntry.count({ where: { transaction: { operation_id: operation.id } } })).toBe(6)
    expect(await withTransaction(tx => availableFunds(tx, value.payment))).toBe(BigInt(10001))
  })
  it('does not let concurrent reconciliation clear a live OTP submission lease or enable a duplicate POST', async () => {
    const value = await source(), operation = await payoutRequest(value)
    transferResult = 'otp'
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    await executeFinancialOperation(value.staff.id, operation.id)
    let release: () => void = () => undefined
    finalizeGate = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { finalizeStarted = resolve })
    const first = finalizeFinancialTransfer(value.staff.id, operation.id, '123456')
    await entered
    try {
      await expect(reconcileFinancialOperation(value.host.id, operation.id)).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' })
      await expect(finalizeFinancialTransfer(value.staff.id, operation.id, '123456')).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' })
    } finally { release() }
    expect((await first).status).toBe('succeeded')
    expect(calls.filter(call => call.method === 'POST' && call.path === '/transfer/finalize_transfer')).toHaveLength(1)
  }, 15000)
  it('never applies hold default to a converted source and funds rental payouts from hold plus balance once', async () => {
    const value = await source({ kind: 'hold', status: 'converted', amount: BigInt(20000) })
    const rental = await prisma.booking.create({ data: { listing_id: value.listing.id, seeker_id: value.renter.id, lister_id: value.host.id, kind: 'rental', status: 'completed',
      starts_at: value.booking.starts_at, ends_at: value.booking.ends_at, amount_kobo: BigInt(100000), hold_credit_kobo: BigInt(20000), currency: 'NGN' } })
    await prisma.holdCreditAllocation.create({ data: { hold_booking_id: value.booking.id, rental_booking_id: rental.id, amount_kobo: BigInt(20000), currency: 'NGN' } })
    const balance = await prisma.paymentIntent.create({ data: { booking_id: rental.id, user_id: value.renter.id, kind: 'booking', status: 'succeeded', reference: randomUUID(),
      idempotency_key: randomUUID(), amount_kobo: BigInt(80000), customer_email: value.renter.email, provider_environment: 'test', provider_transaction_id: String(serial++), paid_at: new Date() } })
    await withTransaction(tx => insertBalancedLedger(tx, { payment_id: balance.id, kind: 'provider_collection', currency: 'NGN', entries: [
      { account_key: 'provider:paystack:collections', direction: 'debit', amount_kobo: BigInt(80000), currency: 'NGN' },
      { account_key: `customer:${value.renter.id}:unsettled`, direction: 'credit', amount_kobo: BigInt(80000), currency: 'NGN' },
    ] }))
    vi.stubEnv('SETTLEMENT_HOLD_DEFAULT_POLICY', '30-70-v1')
    await expect(payoutRequest(value, '14000', '30-70-v1')).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' })
    await prisma.booking.update({ where: { id: value.booking.id }, data: { settlement_status: 'unsettled' } })
    const operation = await requestFinancialOperation(value.host.id, { clientId: randomUUID(), kind: 'payout', bookingId: rental.id, recipientId: value.recipient.id, amountKobo: '100000', reason })
    expect(await prisma.financialAllocation.count({ where: { operation_id: operation.id } })).toBe(2)
    await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
    expect((await executeFinancialOperation(value.staff.id, operation.id)).status).toBe('succeeded')
    expect(await prisma.ledgerTransaction.count({ where: { operation_id: operation.id } })).toBe(2)
    await expect(refundRequest(value)).rejects.toMatchObject({ code: 'CREDIT_ALLOCATED' })
    expect(await getFinancialPayment(value.renter.id, value.payment.id)).toMatchObject({ bookingId: value.booking.id, refundBookingId: rental.id, environment: 'test' })
    await expect(getFinancialPayment(value.host.id, value.payment.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('deduplicates canonical authenticated events and quarantines materially conflicting deliveries', async () => {
    const hint = normalizePaystackWebhook(new TextEncoder().encode(JSON.stringify({ event: 'transfer.success', data: { domain: 'test', reference: `rt-payout-${randomUUID()}`,
      id: serial++, amount: 1000, currency: 'NGN', status: 'success', customer: { email: 'PRIVATE' } } })), 'test')!.hint
    const [first, duplicate] = await Promise.all([ingestProviderReceipt(hint), ingestProviderReceipt(hint)])
    expect(first).toBe(duplicate)
    expect(await prisma.providerReceipt.count({ where: { event_key: hint.eventKey } })).toBe(1)
    expect(JSON.stringify((await prisma.providerReceipt.findUniqueOrThrow({ where: { id: first } })).hints)).not.toContain('PRIVATE')
    await ingestProviderReceipt({ ...hint, payloadHash: '0'.repeat(64), amountKobo: '999' })
    expect(await prisma.providerReceipt.findUnique({ where: { id: first } })).toMatchObject({ status: 'dead_letter', last_error_code: 'CANONICAL_EVENT_COLLISION' })
    expect(await processProviderReceipt(first)).toBe(false)
  })
  it('reconciles ambiguous refund hints by each known reference instead of guessing equal partial amounts', async () => {
    const value = await source()
    const first = await refundRequest(value, '10000'), second = await refundRequest(value, '10000')
    refundResult = 'pending'
    for (const operation of [first, second]) {
      await decideFinancialOperation(value.staff.id, operation.id, 'approve', reason)
      await executeFinancialOperation(value.staff.id, operation.id)
    }
    refunds.get(first.reference)!.status = 'processed'
    const hint = normalizePaystackWebhook(new TextEncoder().encode(JSON.stringify({ event: 'refund.processed', data: { domain: 'test', transaction_reference: value.payment.reference,
      refund_reference: null, amount: '10000', currency: 'NGN', status: 'processed' } })), 'test')!.hint
    const receipt = await ingestProviderReceipt(hint)
    expect(await processProviderReceipt(receipt)).toBe(true)
    expect(await processProviderReceipt(receipt)).toBe(false)
    expect(await prisma.financialOperation.findUnique({ where: { id: first.id } })).toMatchObject({ status: 'succeeded' })
    expect(await prisma.financialOperation.findUnique({ where: { id: second.id } })).toMatchObject({ status: 'pending' })
    expect(calls.filter(call => call.method === 'POST' && call.path === '/refund')).toHaveLength(2)
  }, 15000)
  it('quarantines a crashed final receipt attempt and skips other provider modes instead of starving due work', async () => {
    const receipt = await prisma.providerReceipt.create({ data: { provider_environment: 'test', event_key: randomUUID(), entity_kind: 'refund', payload_hash: 'f'.repeat(64),
      status: 'processing', attempts: 8, lease_token: randomUUID(), lease_expires_at: new Date(Date.now() - 1000), next_attempt_at: new Date(Date.now() - 1000) } })
    const otherMode = await prisma.providerReceipt.create({ data: { provider_environment: 'live', event_key: randomUUID(), entity_kind: 'refund', payload_hash: 'e'.repeat(64), status: 'pending', attempts: 0 } })
    await runFinancialReconciliationBatch(2)
    expect(await prisma.providerReceipt.findUnique({ where: { id: receipt.id } })).toMatchObject({ status: 'dead_letter', last_error_code: 'RECEIPT_RETRY_LIMIT' })
    expect(await prisma.providerReceipt.findUnique({ where: { id: otherMode.id } })).toMatchObject({ status: 'pending', attempts: 0 })
  })
})

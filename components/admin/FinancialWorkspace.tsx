'use client'

import { FinancialOperationReview } from './FinancialOperationReview'
import { FinancialReceipts } from './FinancialReceipts'
import { field, button, naira } from './financial-ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { financialOverviewSchema, financialOperationResultSchema, type FinancialOverview } from '@/lib/contracts/financial'

class FinancialRequestError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message) }
}

async function financialRequest(actorId: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api/v1/financial${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-Rentral-Account': actorId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
  const result: unknown = await response.json()
  if (!response.ok || typeof result !== 'object' || result === null || !('success' in result) || result.success !== true || !('data' in result)) {
    const failure = typeof result === 'object' && result !== null ? result : {}
    const uncertain = response.ok || response.status >= 500 || ('code' in failure && failure.code === 'FINANCIAL_OUTCOME_UNCERTAIN')
    const message = 'error' in failure && typeof failure.error === 'string' && failure.error.length <= 500 ? failure.error : 'The result could not be confirmed. Refresh the records before trying another instruction.'
    throw new FinancialRequestError(message, uncertain)
  }
  return result.data
}

function inputKobo(value: string): string {
  if (!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(value.trim())) throw new Error('Enter a positive NGN amount with up to two decimal places.')
  const [whole, fraction = ''] = value.trim().split('.')
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))
  if (amount <= BigInt(0)) throw new Error('Enter an amount greater than zero.')
  return amount.toString()
}

export function FinancialWorkspace({ actorId, scope = 'staff' }: { actorId: string; scope?: 'staff' | 'member' }) {
  const [overview, setOverview] = useState<FinancialOverview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [kind, setKind] = useState<'refund' | 'payout'>('refund')
  const visibleKind = scope === 'member' ? 'refund' : kind
  const [policyVersion, setPolicyVersion] = useState('standard-v1')
  const [lockedRequest, setLockedRequest] = useState<unknown | null>(null)
  const requestId = useRef<string | null>(null)
  const mounted = useRef(true)
  const load = useCallback(async () => {
    const value = financialOverviewSchema.parse(await financialRequest(actorId, scope === 'staff' ? '?scope=staff' : ''))
    if (mounted.current) { setOverview(value); setNeedsRefresh(false) }
  }, [actorId, scope])
  useEffect(() => {
    mounted.current = true
    void load().catch(() => { if (mounted.current) setMessage('Payment records could not load. Refresh to try again.') })
    return () => { mounted.current = false }
  }, [load])
  async function refresh(): Promise<void> {
    if (busy) return
    setBusy(true); setMessage('')
    try { await load() }
    catch { setMessage('Records could not refresh. Keep the existing payment references and try again later.') }
    finally { if (mounted.current) setBusy(false) }
  }
  async function mutate(path: string, body: unknown, expectedId?: string): Promise<void> {
    if (busy || needsRefresh) return
    setBusy(true); setMessage('')
    let confirmed = false
    try {
      const { operation } = financialOperationResultSchema.parse(await financialRequest(actorId, path, body))
      if (expectedId && operation.id !== expectedId) throw new Error('Unconfirmed operation response')
      confirmed = true
      setMessage('Instruction recorded. Read the current status below; only provider confirmation establishes settlement.')
      requestId.current = null
      if (path === '/operations') setLockedRequest(null)
      setNeedsRefresh(true)
      await load()
    } catch (error) {
      if (!confirmed && error instanceof FinancialRequestError && !error.uncertain && path === '/operations') {
        requestId.current = null; setLockedRequest(null); setNeedsRefresh(false); setMessage(error.message)
        return
      }
      setNeedsRefresh(true)
      if (!confirmed && path === '/operations') setLockedRequest(body)
      setMessage(confirmed ? 'The instruction was recorded, but the list could not refresh. Refresh before continuing.' : 'The result could not be confirmed. Refresh the records before sending another instruction.')
    }
    finally { if (mounted.current) setBusy(false) }
  }
  async function older(section: 'operations' | 'payments'): Promise<void> {
    if (!overview || busy) return
    const cursor = section === 'operations' ? overview.operationsNextCursor : overview.paymentsNextCursor
    if (!cursor) return
    setBusy(true)
    try {
      const page = financialOverviewSchema.parse(await financialRequest(actorId, `?${scope === 'staff' ? 'scope=staff&' : ''}${section}Cursor=${encodeURIComponent(cursor)}`))
      setOverview(current => current ? { ...current,
        ...(section === 'operations' ? { operations: [...new Map([...current.operations, ...page.operations].map(item => [item.id, item])).values()], operationsNextCursor: page.operationsNextCursor }
          : { payments: [...new Map([...current.payments, ...page.payments].map(item => [item.id, item])).values()], paymentsNextCursor: page.paymentsNextCursor }),
      } : page)
    } catch { setMessage('Older records could not load. The current list is preserved.') }
    finally { setBusy(false) }
  }
  async function retryReceipt(id: string, reason: string): Promise<void> {
    if (busy || needsRefresh) return
    setBusy(true); setMessage('')
    try {
      const result = await financialRequest(actorId, `/receipts/${encodeURIComponent(id)}`, { reason })
      if (!result || typeof result !== 'object' || !('queued' in result) || result.queued !== true) throw new Error('Unconfirmed event acknowledgement')
      setMessage('The original event is queued for provider verification.')
      await load()
    } catch { setNeedsRefresh(true); setMessage('The recovery result could not be confirmed. Refresh the records before trying again.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4 min-w-0"><div><h1 className="text-3xl font-semibold break-words">{scope === 'staff' ? 'Payment operations' : 'Your refunds and payment history'}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">{scope === 'staff' ? 'Review refund and payout requests, record independent decisions and reconcile Paystack results. Requests reserve collected funds while they await a decision.' : 'Request a review of your collected payment and follow its actual status. A request reserves funds for independent review; it does not mean a refund has been paid.'}</p></div><button onClick={() => { void refresh() }} disabled={busy} className={button}>{busy ? 'Loading…' : 'Refresh records'}</button></div>
    {message && <p role="status" className="rounded-xl border border-border-subtle p-4 text-sm leading-relaxed text-text-secondary">{message}</p>}
    {lockedRequest !== null && <div className="space-y-3 rounded-xl border border-glass-border-warning bg-glass-warning p-4"><p className="text-sm text-text-primary">An earlier request needs confirmation. After refreshing, retry its original details with the same request identifier.</p><button disabled={busy || needsRefresh} className={button} onClick={() => { void mutate('/operations', lockedRequest) }}>Check the original request</button></div>}
    {overview && !overview.settlementAvailable && <p className="rounded-xl border border-glass-border-warning bg-glass-warning p-4 text-sm text-text-primary">{scope === 'staff' ? 'Provider settlement is unavailable. Review requests and existing results here; sending instructions requires configured merchant capabilities.' : 'New transfers are temporarily unavailable. Your review requests and existing payment history remain available.'}</p>}
    <section className="rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6 min-w-0 max-w-full wrap-anywhere text-text-primary"><h2 className="text-xl font-semibold break-words">Request a reviewed operation</h2><form className="mt-5 grid gap-4 sm:grid-cols-2 min-w-0 max-w-full" onSubmit={event => {
      event.preventDefault()
      if (lockedRequest !== null) return
      const form = new FormData(event.currentTarget)
      try {
        const amountKobo = inputKobo(String(form.get('amount') ?? ''))
        requestId.current ??= crypto.randomUUID()
        const reason = String(form.get('reason') ?? '').trim()
        const refundBookingId = String(form.get('refundBookingId') ?? '').trim()
        const body = { clientId: requestId.current, kind: visibleKind, amountKobo, reason, policyVersion: visibleKind === 'refund' ? 'standard-v1' : policyVersion,
          ...(visibleKind === 'refund' ? { paymentId: String(form.get('paymentId') ?? '').trim(), ...(refundBookingId ? { bookingId: refundBookingId } : {}) } : { bookingId: String(form.get('bookingId') ?? '').trim(), recipientId: String(form.get('recipientId') ?? '').trim() }) }
        void mutate('/operations', body)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Check the amount and request details.') }
    }}><fieldset disabled={lockedRequest !== null} className="contents min-w-0 max-w-full">
      {scope === 'staff' ? <label className="text-xs text-text-muted min-w-0 max-w-full">Operation<select value={kind} disabled={busy || needsRefresh} onChange={event => { setKind(event.target.value === 'payout' ? 'payout' : 'refund'); requestId.current = null }} className={field}><option value="refund">Refund to the original payer</option><option value="payout">Payout to a host recipient</option></select></label> : <p className="self-center text-sm text-text-secondary">Refund to the original payer</p>}
      <label className="text-xs text-text-muted min-w-0 max-w-full">Amount (NGN)<input required name="amount" inputMode="decimal" placeholder="1000.00" disabled={busy || needsRefresh} className={field} /></label>
      {visibleKind === 'refund' ? <><label className="text-xs text-text-muted sm:col-span-2 min-w-0 max-w-full">Source payment ID{scope === 'staff' ? <input required name="paymentId" maxLength={36} autoCapitalize="none" disabled={busy || needsRefresh} className={field} /> : <select required name="paymentId" disabled={busy || needsRefresh} className={field}><option value="">Choose your collected payment</option>{overview?.payments.filter(payment => BigInt(payment.availableKobo) > BigInt(0)).map(payment => <option key={payment.id} value={payment.id}>{naira(payment.availableKobo)} available · {payment.reference}</option>)}</select>}</label><label className="text-xs text-text-muted sm:col-span-2 min-w-0 max-w-full">Funded rental booking ID (for converted holding credit)<input name="refundBookingId" maxLength={36} autoCapitalize="none" disabled={busy || needsRefresh} className={field} /></label></> : <>
        <label className="text-xs text-text-muted min-w-0 max-w-full">Booking ID<input required name="bookingId" maxLength={36} disabled={busy || needsRefresh} className={field} /></label>
        <label className="text-xs text-text-muted min-w-0 max-w-full">Recipient ID<input required name="recipientId" maxLength={36} disabled={busy || needsRefresh} className={field} /></label>
        <label className="text-xs text-text-muted sm:col-span-2 min-w-0 max-w-full">Disposition<select value={policyVersion} onChange={event => setPolicyVersion(event.target.value)} disabled={busy || needsRefresh} className={field}><option value="standard-v1">Reviewed completed booking</option><option value="30-70-v1">Expired hold — reviewed 70% host / 30% retained policy</option></select></label>
      </>}
      <label className="text-xs text-text-muted sm:col-span-2 min-w-0 max-w-full">Evidence and reason<textarea required name="reason" minLength={20} maxLength={500} rows={3} disabled={busy || needsRefresh} className={field} /></label>
      <button disabled={!overview || busy || needsRefresh || lockedRequest !== null} className={`${button} bg-accent-primary text-text-inverse sm:col-span-2`}>Record request for independent review</button>
    </fieldset></form></section>
    <section className="space-y-4" aria-label={scope === 'staff' ? 'Financial operation queue' : 'Your financial requests'}><h2 className="text-xl font-semibold break-words">Current requests and results</h2>{!overview ? <p className="text-sm text-text-muted">Loading payment records…</p> : !overview.operations.length ? <p className="rounded-2xl border border-border-subtle p-6 text-sm text-text-muted">No payment operations to review.</p> : overview.operations.map(operation => <FinancialOperationReview key={operation.id} operation={scope === 'staff' ? operation : { ...operation, actions: { ...operation.actions, approve: false, execute: false, finalize: false, retryRefund: false, reconcile: false } }} disabled={busy || needsRefresh} onSubmit={mutate} />)}</section>
    {overview?.operationsNextCursor && <button disabled={busy} className={button} onClick={() => { void older('operations') }}>Load older operations</button>}
    <section className="space-y-4"><h2 className="text-xl font-semibold break-words">Collected payment sources</h2>{overview?.payments.map(payment => <article key={payment.id} className="space-y-2 rounded-xl border border-border-subtle p-4"><p className="text-sm font-semibold">{naira(payment.amountKobo)} · {payment.status.replaceAll('_', ' ')}</p><p className="text-xs font-semibold text-text-secondary">Paystack {payment.environment ?? 'unrecorded'} mode</p><p className="text-xs text-text-muted">Available for review: {naira(payment.availableKobo)}</p><p className="break-all font-mono text-xs text-text-muted">Payment ID: {payment.id}</p>{payment.bookingId && <p className="break-all font-mono text-xs text-text-muted">Booking ID: {payment.bookingId}</p>}{payment.refundBookingId && payment.refundBookingId !== payment.bookingId && <p className="break-all font-mono text-xs text-text-muted">Funded rental booking ID: {payment.refundBookingId}</p>}<p className="break-all text-xs text-text-muted">{payment.reference}</p></article>)}{overview && !overview.payments.length && <p className="text-sm text-text-muted">No collected payment sources.</p>}</section>
    {overview?.paymentsNextCursor && <button disabled={busy} className={button} onClick={() => { void older('payments') }}>Load older payments</button>}
    {overview && scope === 'staff' && <FinancialReceipts receipts={overview.receipts} disabled={busy || needsRefresh} onRetry={retryReceipt} />}
  </div>
}

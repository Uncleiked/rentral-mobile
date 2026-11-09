'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { z } from 'zod'
import { commercialCheckoutSchema, commercialOrderSchema, type CommercialOrderDto } from '@/lib/commerce/contracts'
import { commercialButton, commercialNaira, commercialSecondary } from '@/lib/commerce/client'
import { useCommercialRequest } from '@/components/account/ApiActorScope'

export function OrderCard({ order, onUpdated }: { order: CommercialOrderDto; onUpdated: () => Promise<unknown> }) {
  const commercialRequest = useCommercialRequest()
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState(''), [checkout, setCheckout] = useState<string | null>(null), [needsCheck, setNeedsCheck] = useState(false)
  const latest = order.payments[0], canCheckout = ['created', 'awaiting_payment'].includes(order.status) && (!latest || ['created', 'pending', 'failed', 'abandoned'].includes(latest.status))
  return <article className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{order.kind === 'insights' ? 'Insights access' : 'Sponsored campaign'} · {order.serviceDays} days</h3><p className="mt-2 text-xs text-text-muted">{order.status.replaceAll('_', ' ')} · {order.billingEnvironment === 'test' ? 'Test payment environment' : 'Live payment environment'}</p></div><p className="font-semibold">{commercialNaira(order.amountKobo)}</p></div><p className="break-all text-xs text-text-muted">Order {order.id}</p>{order.kind === 'insights' && <p className="text-xs leading-relaxed text-text-muted">This is a manual fixed-term purchase. A renewal needs a new explicit order; there is no automatic recurring charge.</p>}
    {latest && <div className="rounded-xl border border-border-subtle p-3 text-xs text-text-muted"><p>Latest payment: {latest.status.replaceAll('_', ' ')}</p><p className="mt-2 break-all">{latest.reference}</p></div>}
    <div className="flex flex-wrap gap-3">{canCheckout && <button disabled={pending || needsCheck} className={commercialButton} onClick={() => startTransition(async () => {
      try { const result = await commercialRequest(`commercial/orders/${order.id}/checkout`, commercialCheckoutSchema, 'POST', {}); setCheckout(result.url); setMessage('Checkout prepared. Review this order amount, then open the verified Paystack link.'); await onUpdated() }
      catch (error) { setNeedsCheck(true); setMessage(error instanceof Error ? error.message : 'Check this order before preparing checkout again.') }
    })}>Prepare Paystack checkout</button>}{checkout && <a href={checkout} target="_blank" rel="noopener noreferrer" className={commercialButton}>Open Paystack checkout</a>}
      <button disabled={pending} className={commercialSecondary} onClick={() => startTransition(async () => { if (await onUpdated()) { setNeedsCheck(false); setCheckout(null) } })}>Refresh this purchase</button>
      {latest && !['failed', 'abandoned', 'reversed'].includes(latest.status) && <button disabled={pending} className={commercialSecondary} onClick={() => startTransition(async () => {
        try { await commercialRequest(`commercial/orders/${order.id}/reconcile`, z.object({ order: commercialOrderSchema }).strict(), 'POST', { reference: latest.reference }); await onUpdated(); setNeedsCheck(false); setMessage('Provider status checked. Access still depends on the verified purchase and current service state.') }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Provider status could not be confirmed. Keep the existing reference.') }
      })}>Check existing payment status</button>}
      {!['paid', 'cancelled'].includes(order.status) && <button disabled={pending || needsCheck} className={commercialSecondary} onClick={() => startTransition(async () => {
        try { await commercialRequest(`commercial/orders/${order.id}`, z.object({ order: commercialOrderSchema }).strict(), 'PATCH', { operation: 'cancel' }); await onUpdated(); setMessage('Service order cancelled. Any existing provider attempt still needs reconciliation; cancellation does not create a refund.') }
        catch (error) { setNeedsCheck(true); setMessage(error instanceof Error ? error.message : 'Refresh this order to check cancellation.') }
      })}>Cancel service order</button>}
    </div>
    {['initializing', 'uncertain', 'requires_review'].includes(latest?.status ?? '') && <p className="text-xs leading-relaxed text-text-muted">The previous payment needs reconciliation. An uncertain result never starts a new collection automatically.</p>}
    {order.status === 'paid' && <p className="text-xs leading-relaxed text-text-muted">Provider-confirmed payment is separate from current service eligibility. Refund review, campaign moderation, expiry and account status can suspend access.</p>}
    <Link href="/marketplace/financial" className="inline-flex min-h-11 items-center text-sm text-accent-hover">Financial history and refund review</Link>{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </article>
}

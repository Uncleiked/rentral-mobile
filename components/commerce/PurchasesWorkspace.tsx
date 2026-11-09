'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { z } from 'zod'
import { commercialOverviewSchema, commercialOrderSchema, type CommercialOrderDto } from '@/lib/commerce/contracts'
import { commercialButton, commercialNaira, commercialSecondary } from '@/lib/commerce/client'
import { useCommercialRequest } from '@/components/account/ApiActorScope'
import { OrderCard } from './OrderCard'

export function PurchasesWorkspace({ selectedOrderId }: { selectedOrderId?: string }) {
  const commercialRequest = useCommercialRequest()
  const [data, setData] = useState<z.infer<typeof commercialOverviewSchema> | null>(null), [selected, setSelected] = useState<CommercialOrderDto | null>(null)
  const [message, setMessage] = useState(''), [pending, startTransition] = useTransition(), [uncertain, setUncertain] = useState(false), [checked, setChecked] = useState(false)
  const command = useRef<{ clientId: string; kind: 'insights' } | null>(null)
  const load = useCallback(async (cursor?: string) => {
    try { const overview = await commercialRequest(`commercial${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, commercialOverviewSchema); setData(overview); setChecked(true)
      if (selectedOrderId) setSelected((await commercialRequest(`commercial/orders/${selectedOrderId}`, z.object({ order: commercialOrderSchema }).strict())).order)
      if (command.current && overview.orders.some(order => order.clientId === command.current?.clientId)) { command.current = null; setUncertain(false) }
      setMessage(''); return overview
    } catch (error) { setData(null); setSelected(null); setMessage(error instanceof Error ? error.message : 'Purchases are temporarily unavailable.'); return null }
  }, [selectedOrderId, commercialRequest])
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first) }, [load])
  const buy = () => startTransition(async () => {
    const input = command.current ?? { clientId: crypto.randomUUID(), kind: 'insights' as const }; command.current = input
    try { await commercialRequest('commercial/orders', z.object({ order: commercialOrderSchema }).strict(), 'POST', input); command.current = null; setUncertain(false); await load(); setMessage('Order saved. Review its fixed amount before preparing checkout.') }
    catch (error) { setUncertain(true); setChecked(false); setMessage(error instanceof Error ? error.message : 'Check the original purchase before trying again.') }
  })
  const terms = data?.terms.find(term => term.kind === 'insights')
  return <div className="space-y-6"><div className="flex flex-wrap gap-3"><Link href="/marketplace/insights" className={commercialSecondary}>Insights report</Link><Link href="/marketplace/campaigns" className={commercialSecondary}>Sponsored campaigns</Link><button disabled={pending} className={commercialSecondary} onClick={() => startTransition(async () => { await load() })}>Refresh purchases</button></div>
    {message && <p role="status" className="rounded-xl border border-border-subtle p-4 text-sm text-text-secondary">{message}</p>}
    {!data ? <p className="rounded-2xl border border-border-subtle p-6 text-sm text-text-muted">{message ? 'Existing purchase records are preserved. Refresh in a moment.' : 'Loading purchase records…'}</p> : <>
      <section className="rounded-2xl border border-border-subtle bg-surface-card p-6"><h2 className="text-xl font-semibold">Fixed-term Insights access</h2><p className="mt-3 text-sm leading-relaxed text-text-muted">Coarse monthly observations, separately withheld below ten contributors. Purchasing access does not reveal identities or guarantee market performance.</p>{terms ? <><p className="mt-4 font-semibold">{commercialNaira(terms.amountKobo)} for {terms.serviceDays} days · {terms.billingEnvironment} environment</p><button disabled={pending || uncertain || !data.enabled} className={`${commercialButton} mt-4`} onClick={buy}>Create an Insights order</button></> : <p className="mt-4 text-sm text-text-muted">New Insights purchases are temporarily unavailable.</p>}{uncertain && <div className="mt-4 space-y-3"><p className="text-xs leading-relaxed text-text-muted">Check the purchase history before explicitly retrying the same request. The original identifier is retained here.</p><button disabled={pending || !checked} className={commercialSecondary} onClick={buy}>Retry original order request</button></div>}{data.insightsAccess && <Link href="/marketplace/insights" className="ml-3 inline-flex min-h-11 items-center text-sm text-accent-hover">Open available Insights</Link>}</section>
      {data.entitlements.length > 0 && <section className="rounded-2xl border border-border-subtle p-5"><h2 className="font-semibold">Purchased terms</h2><ul className="mt-3 space-y-3 text-sm text-text-muted">{data.entitlements.map(term => <li key={term.id}>{new Date(term.startsAt).toLocaleDateString('en-NG')} – {new Date(term.endsAt).toLocaleDateString('en-NG')} · {term.status} · {term.billingEnvironment}</li>)}</ul><p className="mt-3 text-xs text-text-muted">The report checks the current paid proof on every request; a term record alone does not guarantee current access.</p></section>}
      {selected && <section className="space-y-3"><h2 className="text-xl font-semibold">Selected purchase</h2><OrderCard order={selected} onUpdated={() => load()} /></section>}
      <section className="space-y-4"><h2 className="text-xl font-semibold">Purchase history</h2>{data.orders.filter(order => order.id !== selected?.id).map(order => <OrderCard key={order.id} order={order} onUpdated={() => load()} />)}{!data.orders.length && <p className="rounded-2xl border border-border-subtle p-6 text-sm text-text-muted">No purchases on this page.</p>}{data.ordersNextCursor && <button disabled={pending} className={commercialSecondary} onClick={() => startTransition(async () => { await load(data.ordersNextCursor ?? undefined) })}>Older purchases</button>}</section>
    </>}
  </div>
}

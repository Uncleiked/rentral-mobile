'use client'

import type { FinancialOverview } from '@/lib/contracts/financial'
import { button, field } from './financial-ui'

export function FinancialReceipts({ receipts, disabled, onRetry }: { receipts: FinancialOverview['receipts']; disabled: boolean; onRetry: (id: string, reason: string) => Promise<void> }) {
  return <section className="space-y-4"><h2 className="text-xl font-semibold break-words">Provider event recovery</h2><p className="text-sm leading-relaxed text-text-muted">Authenticated events are checked against Paystack before any journal is posted. Requeueing checks the original event; it does not send a new payment instruction.</p>
    {!receipts.length && <p className="text-sm text-text-muted">No recent provider events.</p>}
    {receipts.map(receipt => <article key={receipt.id} className="space-y-3 rounded-xl border border-border-subtle p-4"><p className="text-sm font-semibold capitalize">{receipt.kind} · {receipt.status.replaceAll('_', ' ')}</p><p className="text-xs uppercase text-text-muted">Paystack {receipt.environment}</p><p className="text-xs text-text-muted">Attempts: {receipt.attempts} · Received {new Date(receipt.receivedAt).toLocaleString('en-NG')}</p>{receipt.lastErrorCode && <p className="break-words text-xs text-trust-flagged">{receipt.lastErrorCode.replaceAll('_', ' ')}</p>}
      {['failed', 'dead_letter'].includes(receipt.status) && receipt.lastErrorCode !== 'CANONICAL_EVENT_COLLISION' && <form className="space-y-3 min-w-0 max-w-full" onSubmit={event => {
        event.preventDefault()
        const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim()
        void onRetry(receipt.id, reason)
      }}><label className="block text-xs text-text-muted min-w-0 max-w-full">Recovery review<textarea name="reason" required minLength={20} maxLength={500} rows={2} disabled={disabled} className={field} /></label><button className={button} disabled={disabled}>Requeue provider verification</button></form>}
    </article>)}
  </section>
}

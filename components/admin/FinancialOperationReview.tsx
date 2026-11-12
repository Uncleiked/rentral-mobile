'use client'

import { useState } from 'react'
import type { FinancialOperationDTO } from '@/lib/contracts/financial'
import { actionLabels, field, button, naira, type OperationAction } from './financial-ui'

export function FinancialOperationReview({ operation, disabled, onSubmit }: { operation: FinancialOperationDTO; disabled: boolean; onSubmit: (path: string, body: unknown, expectedId?: string) => Promise<void> }) {
  const available: readonly OperationAction[] = ['approve', 'reject', 'execute', 'reconcile', 'finalize', 'retryRefund']
  const actions = available.filter(action => operation.actions[action])
  const [selectedAction, setSelectedAction] = useState<OperationAction | ''>('')
  const action = selectedAction && actions.includes(selectedAction) ? selectedAction : actions[0] ?? ''
  return <article className="space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6 min-w-0 max-w-full wrap-anywhere text-text-primary">
    <div className="flex flex-wrap justify-between gap-3 min-w-0"><div><h3 className="text-lg font-semibold capitalize">{operation.kind} · {naira(operation.amountKobo)}</h3><p className="mt-2 text-sm text-accent-hover">{operation.status.replaceAll('_', ' ')}</p></div><p className="text-xs text-text-muted">{new Date(operation.createdAt).toLocaleString('en-NG')}</p></div>
    <p className="text-xs uppercase tracking-wide text-text-muted">Paystack {operation.environment} environment</p><p className="break-all font-mono text-xs text-text-muted">{operation.reference}</p><p className="whitespace-pre-wrap break-words text-sm text-text-secondary">{operation.reason}</p>
    {operation.retainedKobo !== '0' && <p className="text-xs text-text-muted">Retained under {operation.policyVersion}: {naira(operation.retainedKobo)}</p>}
    {operation.providerStatus && <p className="text-xs text-text-muted">Paystack status: {operation.providerStatus}</p>}
    {operation.failureCode && <p className="text-xs text-trust-flagged">Review required: {operation.failureCode.replaceAll('_', ' ')}</p>}
    {actions.length > 0 && <form className="space-y-4 border-t border-border-subtle pt-4 min-w-0 max-w-full" onSubmit={event => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      void onSubmit(`/operations/${encodeURIComponent(operation.id)}`, { action,
        ...(action === 'approve' || action === 'reject' ? { reason: String(values.get('reason') ?? '').trim() } : {}),
        ...(action === 'finalize' ? { otp: String(values.get('otp') ?? '').trim() } : {}),
        ...(action === 'retryRefund' ? { accountNumber: String(values.get('accountNumber') ?? '').trim(), bankId: String(values.get('bankId') ?? '').trim() } : {}),
      }, operation.id)
    }}>
      <label className="block text-xs text-text-muted min-w-0 max-w-full">Next action<select value={action} disabled={disabled} onChange={event => { const next = actions.find(item => item === event.target.value); if (next) setSelectedAction(next) }} className={field}>{actions.map(item => <option key={item} value={item}>{actionLabels[item]}</option>)}</select></label>
      {(action === 'approve' || action === 'reject') && <label className="block text-xs text-text-muted min-w-0 max-w-full">Decision reason<textarea name="reason" required minLength={20} maxLength={500} disabled={disabled} rows={3} className={field} /></label>}
      {action === 'finalize' && <label className="block text-xs text-text-muted min-w-0 max-w-full">Paystack transfer OTP<input name="otp" required inputMode="numeric" autoComplete="one-time-code" disabled={disabled} className={field} /></label>}
      {action === 'retryRefund' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-text-muted min-w-0 max-w-full">Refund account number<input name="accountNumber" required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="off" disabled={disabled} className={field} /></label><label className="text-xs text-text-muted min-w-0 max-w-full">Paystack bank ID<input name="bankId" required inputMode="numeric" pattern="[0-9]+" autoComplete="off" disabled={disabled} className={field} /></label></div>}
      <button disabled={disabled || !action} className={button}>{action ? actionLabels[action] : 'No available action'}</button>
    </form>}
  </article>
}

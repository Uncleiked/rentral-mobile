'use client'

import { useState, useTransition } from 'react'
import { startListingFeePaymentAction } from '@/app/actions/paymentActions'

type Props = { listingId: string; enabled: boolean }

export function ListingFeeButton({ listingId, enabled }: Props) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  return <div className="space-y-3">
    <button disabled={!enabled || pending} className="min-h-12 w-full rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50" onClick={() => startTransition(async () => {
      setError('')
      try { const result = await startListingFeePaymentAction(listingId); if (result.success) window.location.assign(result.data); else setError(result.error) }
      catch { setError('Unable to connect. Check payment status before paying again.') }
    })}>{pending ? 'Preparing checkout…' : 'Pay ₦1,000 listing fee'}</button>
    {!enabled && <p className="text-xs leading-relaxed text-text-muted">Payments are being prepared. The listing stays pending until payment and all publication checks are verified.</p>}
    {error && <p role="alert" className="text-sm text-trust-flagged">{error}</p>}
  </div>
}

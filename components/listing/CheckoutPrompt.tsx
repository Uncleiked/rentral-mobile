'use client'

import { useState } from 'react'
import { Copy, Landmark } from 'lucide-react'
import { useRentralStore } from '@/store/useRentralStore'

const MOCK_ACCOUNT_NUMBER = '9019283746'
const MOCK_BANK_NAME = 'OPay (Paycom)'

export function CheckoutPrompt() {
  const [isConfirming, setIsConfirming] = useState(false)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  const handleConfirm = () => {
    setIsConfirming(true)
    // Placeholder for the OPay webhook confirmation wired in the next build phase.
    setTimeout(() => {
      setIsConfirming(false)
      goNext()
    }, 1200)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Activate your listing
        </h2>
        <p className="text-sm text-text-secondary">
          A small anti-spam fee keeps ghost listings off Rentral.
        </p>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-card px-6 py-6">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <span className="text-sm font-medium text-text-secondary">Listing Fee</span>
          <span className="text-xl font-extrabold text-accent-hover">₦1,000</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-glass-light">
            <Landmark className="h-4 w-4 text-text-primary" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{MOCK_BANK_NAME}</p>
            <p className="text-sm font-semibold text-text-primary">Dynamic Virtual Account</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border-subtle bg-background-app px-4 py-3">
          <span className="text-lg font-bold tracking-widest text-text-primary">{MOCK_ACCOUNT_NUMBER}</span>
          <Copy className="h-4 w-4 text-text-muted" />
        </div>

        <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
          Expires in 30:00
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={goBack}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isConfirming}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isConfirming ? 'Confirming...' : "I've Paid"}
        </button>
      </div>
    </div>
  )
}

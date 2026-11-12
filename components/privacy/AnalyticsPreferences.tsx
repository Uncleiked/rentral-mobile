'use client'

import { useState, useTransition } from 'react'
import { setAnalyticsConsentAction, deleteAnalyticsHistoryAction } from '@/app/actions/analyticsActions'

export function AnalyticsPreferences({ initialAllowed }: { initialAllowed: boolean }) {
  const [allowed, setAllowed] = useState(initialAllowed)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  return <section className="rounded-2xl border border-border-subtle bg-surface-card p-6 min-w-0 max-w-full wrap-anywhere text-text-primary"><h2 className="text-lg font-semibold break-words">Your contribution to Rentral Insights</h2><p className="mt-3 text-sm leading-relaxed text-text-muted">You can choose to contribute broad search preferences to market research. We keep neighborhoods and budget bands, exclude search text, identity details and exact coordinates, and only show groups of at least ten people. Essential booking and payment records remain separate.</p><label className="mt-5 flex items-center gap-3 text-sm min-w-0 max-w-full"><input type="checkbox" checked={allowed} disabled={pending} onChange={event => { const value = event.target.checked; startTransition(async () => { try { await setAnalyticsConsentAction(value); setAllowed(value); setMessage('Your preference has been saved.') } catch { setMessage('Your preference could not be saved.') } }) }} className="size-5 accent-accent-primary" />Contribute aggregate market preferences</label><button type="button" disabled={pending} onClick={() => startTransition(async () => { try { const result = await deleteAnalyticsHistoryAction(); setMessage(result.success ? 'Your search analytics have been removed and contributions switched off.' : result.error); if (result.success) setAllowed(false) } catch { setMessage('Please try again.') } })} className="mt-5 rounded-xl border border-border-subtle px-4 py-3 text-xs text-text-secondary min-h-11 max-w-full whitespace-normal break-words">Remove my search analytics</button>{message && <p role="status" className="mt-3 text-sm text-text-secondary">{message}</p>}</section>
}

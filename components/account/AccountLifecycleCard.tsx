'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { accountCloseResultSchema, accountExportPageSchema, accountExportResources, type AccountExportResource } from '@/lib/contracts/account-lifecycle'
import { accountLifecycleRequest } from '@/lib/account-lifecycle-client'

/** Export is intentionally paged so a large inbox never becomes a single bulk request. */
export function AccountLifecycleCard({ userId }: { userId: string }) {
  const router = useRouter()
  const [resource, setResource] = useState<AccountExportResource>('profile'), [cursor, setCursor] = useState<string | null>(null)
  const [password, setPassword] = useState(''), [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null)
  async function download() {
    setBusy(true); setError(null)
    try {
      const params = new URLSearchParams({ resource, limit: '100', ...(cursor ? { cursor } : {}) })
      const page = await accountLifecycleRequest(`/export?${params}`, accountExportPageSchema, userId)
      const url = URL.createObjectURL(new Blob([JSON.stringify(page, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `rentral-${resource}-${cursor ?? 'first'}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setCursor(page.nextCursor); setMessage(page.nextCursor ? 'This page was downloaded. Download the next page to continue.' : 'This resource is complete. Select another resource to download it.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The export could not be downloaded.') }
    finally { setBusy(false) }
  }
  async function close(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!acknowledged || !password) return
    setBusy(true); setError(null)
    try {
      await accountLifecycleRequest('/close', accountCloseResultSchema, userId, { currentPassword: password })
      router.replace('/sign-in'); router.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Account closure could not be confirmed. Refresh before continuing.') }
    finally { setPassword(''); setBusy(false) }
  }
  const field = 'min-h-11 min-w-0 w-full rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary'
  return <section aria-labelledby="account-records" className="min-w-0 space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-7">
    <div><h2 id="account-records" className="text-lg font-semibold">Your records and account</h2><p className="mt-2 text-sm leading-relaxed text-text-secondary">Download your records before closing your account. Export pages include your own account activity. Passwords, sign-in tokens, private GPS and another person’s private evidence are excluded. Uploaded files are not included.</p></div>
    {error && <p role="alert" className="break-words text-sm text-red-400">{error}</p>}{message && <p role="status" className="break-words text-sm text-text-secondary">{message}</p>}
    <div className="flex flex-col gap-3 sm:flex-row"><label className="min-w-0 flex-1 space-y-2 text-sm text-text-secondary"><span>Export resource</span><select value={resource} disabled={busy} onChange={event => { setResource(event.target.value as AccountExportResource); setCursor(null); setMessage(null) }} className={field}>{accountExportResources.map(item => <option key={item} value={item}>{item}</option>)}</select></label><button type="button" disabled={busy} onClick={() => void download()} className="min-h-11 self-end rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50">{cursor ? 'Download next page' : 'Download resource'}</button></div>
    <form onSubmit={close} className="space-y-4 border-t border-border-subtle pt-6"><h3 className="font-semibold">Close account</h3><p className="text-sm leading-relaxed text-text-secondary">Closing hides your listings and profile, disables matching and signs out every session. Ongoing bookings, open reports or pending payments must be resolved first. Booking, payment and evidence records are retained for obligations and review. This does not erase those records.</p><label className="block space-y-2 text-sm text-text-secondary"><span>Current password</span><input required type="password" autoComplete="current-password" maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} className={field} /></label><label className="flex items-start gap-3 text-sm leading-relaxed text-text-secondary"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>I have downloaded the records I need and understand the retained records described above.</span></label><button disabled={busy || !acknowledged || !password} className="min-h-11 rounded-xl border border-red-400/50 px-4 py-3 text-sm font-semibold text-red-400 disabled:opacity-50">Close my account</button></form>
  </section>
}

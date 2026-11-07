import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { ReviewControls } from '@/components/admin/ReviewControls'
import { requireAdminId } from '@/lib/operations/access'
import { getAdminQueue } from '@/lib/operations/service'
import { platformEnabled } from '@/lib/platform'
import { SafetyNoticeAdminQueue } from '@/components/trust/SafetyNoticeAdminQueue'

export default async function AdminPage() {
  const actorId = await requireAdminId()
  if (!actorId) notFound()
  const queue = platformEnabled() ? await getAdminQueue() : null
  return <MarketplaceShell><div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12"><div><p className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-accent-hover"><ShieldCheck className="size-4" /> Staff workspace</p><h1 className="mt-3 text-3xl font-semibold">Review & operations</h1><p className="mt-3 max-w-2xl text-sm text-text-muted">Review evidence, verify publication requirements, and record decisions. Financial settlement stays subject to provider confirmation.</p></div>
    {!queue ? <p className="rounded-2xl border border-border-subtle p-6 text-text-muted">Apply and verify the platform migrations before enabling this workspace.</p> : <>
      <section><h2 className="mb-4 text-xl font-semibold">Listings awaiting review · {queue.listings.length}</h2><div className="grid gap-4 lg:grid-cols-2">{queue.listings.map(item => <article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5"><p className="text-xs uppercase tracking-widest text-accent-hover">{item.category}</p><Link href={`/marketplace/listing/${item.id}`} className="mt-2 block font-semibold">@{item.lister.username ?? 'member'} · {item.id.slice(0, 8)}</Link><p className="mt-3 text-xs leading-6 text-text-muted">Identity: {item.lister.kyc_verified ? 'verified' : 'pending'} · Video: {item.media?.status ?? 'not processed'}<br />Address: {item.verification?.spatial_status ?? 'pending'} · Document: {item.documentReview?.status ?? 'pending'} · Fee: {item.payments.length ? 'received' : 'unpaid'}</p><a href={`/api/admin/listings/${item.id}/document`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-accent-hover">Open private document ↗</a>{item.documentReview && <details className="mt-3 text-xs"><summary className="cursor-pointer text-text-secondary">Review findings</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-background-app p-3 text-text-muted">{JSON.stringify(item.documentReview.findings, null, 2)}</pre></details>}<ReviewControls id={item.id} /></article>)}</div>{!queue.listings.length && <p className="text-sm text-text-muted">No listings are waiting for review.</p>}</section>
      <section><h2 className="mb-4 text-xl font-semibold">Open reports · {queue.disputes.length}</h2><div className="grid gap-4 lg:grid-cols-2">{queue.disputes.map(item => <article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5"><h3 className="font-semibold">Booking {item.booking_id.slice(0, 8)}</h3><p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">{item.reason}</p><ReviewControls id={item.id} dispute /></article>)}</div>{!queue.disputes.length && <p className="text-sm text-text-muted">No open reports.</p>}</section>
      <section><h2 className="mb-4 text-xl font-semibold">Renewal evidence</h2><p className="mb-4 text-sm text-text-muted">External bank references require supported provider evidence. They are never verified from the reference text alone.</p>{queue.renewals.map(item => <div key={item.id} className="mb-3 rounded-xl border border-border-subtle p-4 text-sm"><p>Booking {item.booking_id.slice(0, 8)} · {item.recipient_route.replaceAll('_', ' ')}</p><p className="mt-2 break-all text-text-muted">Reference: {item.reference}</p><span className="mt-2 block text-xs text-trust-flagged">Pending evidence review</span></div>)}</section>
      <SafetyNoticeAdminQueue actorId={actorId} />
      <section><h2 className="mb-4 text-xl font-semibold">Recent audit trail</h2><div className="space-y-3">{queue.audit.map(item => <article key={item.id} className="rounded-xl border border-border-subtle p-4"><p className="text-sm font-semibold">{item.action.replaceAll('_', ' ')} · {item.target_id.slice(0, 8)}</p><p className="mt-2 text-sm text-text-muted">{item.reason}</p></article>)}</div></section>
    </>}
  </div></MarketplaceShell>
}

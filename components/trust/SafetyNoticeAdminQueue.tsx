import { getSafetyAdminQueue } from '@/lib/trust/safety'
import { safetyReportSubject } from '@/lib/trust/safety-policy'
import { SafetyNoticeControls } from '@/components/trust/SafetyNoticeControls'
import { SafetyAppealControls } from '@/components/trust/SafetyAppealControls'

export async function SafetyNoticeAdminQueue({ actorId }: { actorId: string }) {
  const queue = await getSafetyAdminQueue(actorId)
  if (!queue) return null
  return <section className="space-y-6"><div><h2 className="text-xl font-semibold break-words">Safety findings & appeals</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">Only evidence reviewed by independent staff can produce a profile notice. Low ratings and submitted reports do not automatically create warnings. An appeal must be decided by a different reviewer.</p></div>
    <h3 className="text-base font-semibold">Pending appeals · {queue.appeals.length}</h3>
    <div className="grid gap-4 lg:grid-cols-2">{queue.appeals.map(item => <article key={item.id} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 max-w-full wrap-anywhere text-text-primary"><h4 className="text-sm font-semibold">@{item.notice.subject.username ?? 'member'}</h4><dl className="mt-4 space-y-4 break-words text-sm"><div><dt className="text-xs text-text-muted">Original finding</dt><dd className="mt-1 whitespace-pre-wrap text-text-secondary">{item.notice.private_reason}</dd></div><div><dt className="text-xs text-text-muted">Original report · staff only</dt><dd className="mt-1 whitespace-pre-wrap text-text-secondary">{item.notice.dispute.reason}</dd></div><div><dt className="text-xs text-text-muted">Member’s appeal</dt><dd className="mt-1 whitespace-pre-wrap text-text-secondary">{item.statement}</dd></div></dl><SafetyAppealControls appealId={item.id} /></article>)}</div>
    {!queue.appeals.length && <p className="text-sm text-text-muted">No appeals are awaiting your independent review.</p>}
    <h3 className="text-base font-semibold">Reports available for evidence review · {queue.reports.length}</h3>
    <div className="grid gap-4 lg:grid-cols-2">{queue.reports.map(item => {
      const subject = safetyReportSubject(item) === item.booking.lister_id ? item.booking.lister.username : item.booking.seeker.username
      return <article key={item.id} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 max-w-full wrap-anywhere text-text-primary"><h4 className="text-sm font-semibold">Reported account: @{subject ?? 'member'}</h4><p className="mt-2 text-xs text-text-muted">Booking {item.booking_id.slice(0, 8)}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm text-text-secondary">{item.reason}</p><SafetyNoticeControls disputeId={item.id} /></article>
    })}</div>
    {!queue.reports.length && <p className="text-sm text-text-muted">No eligible reports await a safety review.</p>}
    <p className="text-xs text-text-muted">Queues show up to 50 records at a time. Review decisions are preserved in the administrative audit trail.</p>
  </section>
}

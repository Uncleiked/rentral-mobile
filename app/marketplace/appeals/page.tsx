import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { SafetyAppealForm } from '@/components/trust/SafetyAppealForm'
import { requireSessionUserId } from '@/lib/action-helpers'
import { getOwnSafetyNotices, safetyEnabled } from '@/lib/trust/safety'
import { safetyCategories, safetyCategoryLabels } from '@/lib/trust/safety-policy'

export const metadata = { title: 'Safety notices & appeals | Rentral' }

export default async function SafetyAppealsPage() {
  const userId = await requireSessionUserId()
  if (!userId) redirect('/sign-in')
  const enabled = safetyEnabled()
  const notices = await getOwnSafetyNotices(userId)
  return <MarketplaceShell><div className="mx-auto max-w-3xl space-y-7 min-w-0 w-full"><div><p className="text-xs uppercase tracking-widest text-accent-hover">Your account</p><h1 className="mt-3 text-2xl font-semibold sm:text-3xl break-words">Safety notices & appeals</h1><p className="mt-3 text-sm leading-relaxed text-text-muted">Read staff-reviewed findings affecting your profile and request an independent review. Reports and low ratings alone do not create a public safety notice.</p></div>
    {!enabled ? <div className="rounded-2xl border border-border-subtle bg-surface-card p-6 min-w-0 max-w-full wrap-anywhere text-text-primary"><p className="text-sm text-text-muted">Online safety appeals are being prepared. For account safety support, use the contact options in our help centre.</p><Link href="/help" className="mt-4 inline-flex min-h-11 items-center text-sm text-accent-hover max-w-full break-words">Open help centre →</Link></div> : !notices.length ? <p className="rounded-2xl border border-border-subtle bg-surface-card p-6 text-sm text-text-muted min-w-0 max-w-full wrap-anywhere">There are no staff-issued safety notices on your account.</p> : notices.map(notice => <article key={notice.id} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6 max-w-full wrap-anywhere text-text-primary"><div className="flex flex-wrap items-center justify-between gap-3 min-w-0"><h2 className="text-base font-semibold break-words">{safetyCategories.includes(notice.category as typeof safetyCategories[number]) ? safetyCategoryLabels[notice.category as typeof safetyCategories[number]] : 'Reviewed safety concern'}</h2><span className={`rounded-full border px-3 py-1 text-xs ${notice.status === 'active' ? 'border-glass-border-warning text-trust-flagged' : 'border-border-subtle text-text-muted'}`}>{notice.status === 'active' ? 'Active notice' : 'Notice removed'}</span></div><p className="mt-3 text-xs text-text-muted">Issued {notice.createdAt.toLocaleDateString('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' })}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{notice.private_reason}</p>
      {notice.appeal ? <div className="mt-5 space-y-4 border-t border-border-subtle pt-5"><h3 className="text-sm font-semibold">Your appeal · {notice.appeal.status === 'pending' ? 'Awaiting review' : notice.appeal.status === 'removed' ? 'Accepted' : 'Notice upheld'}</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{notice.appeal.statement}</p>{notice.appeal.decision_reason ? <div><h4 className="text-xs text-text-muted">Independent reviewer’s decision</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{notice.appeal.decision_reason}</p></div> : <p className="text-xs leading-relaxed text-text-muted">The notice remains visible while an independent reviewer considers your appeal. You will receive a notification when a decision is recorded.</p>}</div> : notice.status === 'active' ? <SafetyAppealForm noticeId={notice.id} /> : null}
    </article>)}
  </div></MarketplaceShell>
}

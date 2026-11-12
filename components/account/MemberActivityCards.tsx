import type { MemberActivity } from '@/lib/contracts/dashboard'

export function MemberActivityCards({ activity }: { activity: MemberActivity }) {
  const response = activity.response, inspections = activity.inspections
  const rows = [
    { label: 'Average recorded reply', value: response.averageMinutes === null ? 'Unavailable' : `${response.averageMinutes} min`,
      detail: response.complete ? `${response.samples} completed incoming-message turns in the last 90 days. Unanswered messages are excluded.` : 'The message history exceeds the reporting limit. No partial average is shown.' },
    { label: 'Recorded inspection check-ins', value: inspections.ratePercent === null ? 'Unavailable' : `${inspections.ratePercent}%`,
      detail: inspections.complete ? `${inspections.recorded} of ${inspections.eligible} ended, undisputed inspections in the last 90 days have your check-in recorded.` : 'The inspection history exceeds the reporting limit. No partial rate is shown.' },
    { label: 'Completed-booking reviews', value: activity.reviews.averageRating === null ? 'No reviews' : `${activity.reviews.averageRating.toFixed(1)} / 5`,
      detail: `${activity.reviews.count} reviews received across your completed bookings, over all time.` },
  ]
  return <section aria-label="Your recorded activity" className="space-y-4"><h2 className="text-xl font-semibold break-words">Your recorded activity</h2><p className="max-w-2xl text-xs leading-relaxed text-text-muted">These observations describe recorded activity. Missing check-in evidence does not prove absence, and a response average excludes unanswered messages.</p>
    <div className="grid gap-4 sm:grid-cols-3">{rows.map(row => <article key={row.label} className="min-w-0 space-y-3 rounded-2xl border border-border-subtle bg-surface-card p-5 max-w-full wrap-anywhere text-text-primary"><p className="text-xs text-text-muted">{row.label}</p><p className="break-words text-2xl font-semibold">{row.value}</p><p className="text-xs leading-relaxed text-text-secondary">{row.detail}</p></article>)}</div>
  </section>
}

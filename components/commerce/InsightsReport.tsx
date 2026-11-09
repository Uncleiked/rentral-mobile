'use client'

import { useMemo, useState } from 'react'
import { z } from 'zod'
import { insightsReportSchema } from '@/lib/commerce/contracts'
import { commercialField, commercialSecondary } from '@/lib/commerce/client'

const labels = { search: 'Search observations', detail: 'Listing-detail interest', checkout: 'Checkout interest', verified_booking: 'Provider-confirmed rental observations' }
export function InsightsReport({ report }: { report: z.infer<typeof insightsReportSchema> }) {
  const [event, setEvent] = useState<keyof typeof labels>('search'), [month, setMonth] = useState('all')
  const months = [...new Set(report.items.map(item => item.month))].sort().reverse()
  const items = useMemo(() => report.items.filter(item => item.event === event && (month === 'all' || item.month === month)), [event, month, report.items])
  const maximum = Math.max(1, ...items.map(item => item.observations))
  function download() {
    const columns = ['month', 'event', 'category', 'intent', 'neighborhood', 'budgetBand', 'people', 'observations'] as const
    const csv = [columns.join(','), ...items.map(item => columns.map(column => String(item[column])).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), anchor = document.createElement('a')
    anchor.href = url; anchor.download = `rentral-insights-${report.generatedAt.slice(0, 10)}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="space-y-6"><div className="rounded-2xl border border-border-subtle bg-surface-card p-5"><h2 className="text-xl font-semibold">Observed demand and confirmed rentals</h2><p className="mt-3 text-sm leading-relaxed text-text-muted">Only coarse event/month groups with at least ten distinct consented contributors are reported. Interest and verified rentals are separate observations; their contributors can differ, so they are not a tracked conversion funnel or a forecast.</p><p className="mt-3 text-xs text-text-muted">Observed since {new Date(report.windowStart).toLocaleDateString('en-NG')} · generated {new Date(report.generatedAt).toLocaleString('en-NG')}{report.internalAccess ? ' · Internal review access' : ' · Paid term access'}</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><label className="text-sm text-text-secondary">Observation<select value={event} onChange={change => setEvent(change.target.value as keyof typeof labels)} className={commercialField}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm text-text-secondary">UTC month<select value={month} onChange={change => setMonth(change.target.value)} className={commercialField}><option value="all">All reported months</option>{months.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button disabled={!items.length} onClick={download} className={`${commercialSecondary} self-end`}>Export shown coarse groups</button></div>
    {!items.length ? <div className="rounded-2xl border border-border-subtle p-8"><h3 className="font-semibold">No reportable groups in this view.</h3><p className="mt-3 text-sm leading-relaxed text-text-muted">Small groups are withheld rather than shown as zero. There are no fabricated trends, audience counts or predicted returns.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{items.map(item => <article key={`${item.month}:${item.event}:${item.category}:${item.intent}:${item.neighborhood}:${item.budgetBand}`} className="rounded-2xl border border-border-subtle bg-surface-card p-5"><p className="text-xs uppercase tracking-widest text-accent-hover">{item.month} · {item.category} · {item.intent}</p><h3 className="mt-3 font-semibold capitalize">{item.neighborhood.replaceAll('-', ' ')}</h3><p className="mt-2 text-xs text-text-muted">Budget: {item.budgetBand.replaceAll('-', ' ')}</p><p className="mt-4 text-lg font-semibold">{item.observations.toLocaleString('en-NG')} observations</p><div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-background-app"><div className="h-full rounded-full bg-accent-primary" style={{ width: `${Math.max(1, Math.round(item.observations / maximum * 100))}%` }} /></div><p className="mt-3 text-xs text-text-muted">{item.people.toLocaleString('en-NG')} contributors in this group. Counts across groups or months may include the same people.</p></article>)}</div>}
  </section>
}

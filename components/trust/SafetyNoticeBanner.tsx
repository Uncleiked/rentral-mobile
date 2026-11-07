import Link from 'next/link'
import { hasActiveSafetyNotice } from '@/lib/trust/safety'
import { PUBLIC_SAFETY_NOTICE } from '@/lib/trust/safety-policy'

export async function SafetyNoticeBanner({ subjectId, owner = false }: { subjectId: string; owner?: boolean }) {
  if (!await hasActiveSafetyNotice(subjectId)) return null
  return <aside aria-label="Reviewed account safety notice" className="rounded-2xl border border-glass-border-warning bg-glass-warning px-4 py-4 text-text-primary">
    <h2 className="text-sm font-semibold">Active safety notice</h2>
    <p className="mt-2 text-sm leading-relaxed">{PUBLIC_SAFETY_NOTICE}</p>
    {owner && <Link href="/marketplace/appeals" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover">Read the decision or submit an appeal</Link>}
  </aside>
}

import { redirect } from 'next/navigation'
import { requireUserId } from '@/lib/action-helpers'
import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { MatchingWorkspace } from '@/components/matching/MatchingWorkspace'

export default async function SquatMatesPage() {
  if (!await requireUserId()) redirect('/sign-in')
  return <MarketplaceShell><div className="mx-auto w-full max-w-5xl space-y-8 min-w-0"><header><p className="text-xs uppercase tracking-widest text-accent-hover">Squat-Mates</p><h1 className="mt-3 text-3xl font-semibold sm:text-4xl break-words">Find people with shared home preferences.</h1><p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-muted">Choose whether to appear, compare the preferences you both share, then agree to a conversation. Your exact location, email and booking evidence stay private.</p></header><MatchingWorkspace /></div></MarketplaceShell>
}

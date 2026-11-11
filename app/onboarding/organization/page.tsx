import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { requireSessionUserId } from '@/lib/action-helpers'
import { OrganizationApplicationForm } from '@/components/organizations/OrganizationApplicationForm'

export default async function OrganizationPage() {
  const actorId = await requireSessionUserId()
  if (!actorId) redirect('/sign-in')
  const account = await prisma.user.findUnique({ where: { id: actorId }, select: { account_type: true } })
  if (!account) redirect('/sign-in')
  if (account.account_type == null || account.account_type === 'individual') redirect('/marketplace')
  if (account.account_type !== 'organization') notFound()
  return <main className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12"><Link href="/marketplace/profile" className="inline-flex min-h-11 items-center text-sm text-text-muted">Your account</Link><header><p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Organization registration</p><h1 className="mt-3 text-3xl font-semibold text-text-primary">Introduce your organization</h1><p className="mt-3 text-sm leading-6 text-text-secondary">Submit registration evidence for an independent administrator to review. Marketplace access opens after approval. Personal KYC is not required for this review.</p></header><OrganizationApplicationForm actorId={actorId} /><Link className="inline-flex min-h-11 items-center text-sm text-text-muted" href="/help">Get help with your application</Link></main>
}

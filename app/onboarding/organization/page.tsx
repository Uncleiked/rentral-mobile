import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { requireSessionUserId } from '@/lib/action-helpers'
import { OrganizationApplicationForm } from '@/components/organizations/OrganizationApplicationForm'
import { AccountPage } from '@/components/layout/AccountPage'

export default async function OrganizationPage() {
  const actorId = await requireSessionUserId()
  if (!actorId) redirect('/sign-in')
  const account = await prisma.user.findUnique({ where: { id: actorId }, select: { account_type: true } })
  if (!account) redirect('/sign-in')
  if (account.account_type == null || account.account_type === 'individual') redirect('/marketplace')
  if (account.account_type !== 'organization') notFound()
  return <AccountPage wide><div className="min-w-0 space-y-6">
    <Link href="/marketplace/profile" className="inline-flex min-h-11 items-center rounded-xl text-sm font-medium text-text-secondary transition-colors hover:text-text-primary">Back to your account</Link>
    <header className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Organization registration</p>
      <h1 className="mt-3 break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Introduce your organization</h1>
      <p className="mt-3 text-sm leading-6 text-text-secondary">Submit your registration details and documents for administrator review. You can enter the marketplace once your organization is approved.</p>
    </header>
    <ol aria-label="Organization application steps" className="grid gap-3 rounded-2xl border border-glass-border-light bg-glass-dark p-4 text-sm text-text-secondary sm:grid-cols-3 sm:p-5">
      {['Registration details', 'Supporting documents', 'Administrator review'].map((step, index) => <li key={step} className="flex min-w-0 items-center gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-glass-border-medium text-xs font-semibold text-accent-hover">{index + 1}</span><span>{step}</span></li>)}
    </ol>
    <OrganizationApplicationForm actorId={actorId} />
    <p className="text-xs leading-6 text-text-secondary">Need a hand? <Link className="inline-flex min-h-11 items-center font-medium text-accent-hover underline underline-offset-4" href="/help">Get help with your application</Link></p>
  </div></AccountPage>
}

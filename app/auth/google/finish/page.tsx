import { cookies } from 'next/headers'
import Link from 'next/link'
import { GOOGLE_FINISH_COOKIE, readGoogleFinish } from '@/lib/auth/google-oauth'
import { GoogleFinishForm } from './GoogleFinishForm'
import { AccountPage } from '@/components/layout/AccountPage'
import { accountCard, accountSecondaryAction } from '@/components/ui/account-styles'

export const dynamic = 'force-dynamic'
export default async function GoogleFinishPage() {
  const challenge = await readGoogleFinish((await cookies()).get(GOOGLE_FINISH_COOKIE)?.value).catch(() => null)
  return <AccountPage><section className={accountCard}>
    <p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Your Rentral account</p>
    <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{!challenge ? 'Start Google sign-in again' : challenge.kind === 'link' ? 'Connect your existing account' : 'Finish creating your account'}</h1>
    {challenge ? <GoogleFinishForm kind={challenge.kind} email={challenge.identity.email} /> : <><p className="mt-4 text-sm leading-6 text-text-secondary">This sign-in request expired or has already been used.</p><Link href="/sign-in" className={accountSecondaryAction + ' mt-6 w-full'}>Back to sign-in</Link></>}
  </section></AccountPage>
}

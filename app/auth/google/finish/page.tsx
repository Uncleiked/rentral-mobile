import { cookies } from 'next/headers'
import Link from 'next/link'
import { GOOGLE_FINISH_COOKIE, readGoogleFinish } from '@/lib/auth/google-oauth'
import { GoogleFinishForm } from './GoogleFinishForm'

export const dynamic = 'force-dynamic'
export default async function GoogleFinishPage() {
  const challenge = await readGoogleFinish((await cookies()).get(GOOGLE_FINISH_COOKIE)?.value).catch(() => null)
  return <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10"><section className="w-full rounded-2xl border border-border-subtle bg-surface-card p-6 sm:p-8">
    <h1 className="text-2xl font-semibold text-text-primary">{!challenge ? 'Start Google sign-in again' : challenge.kind === 'link' ? 'Connect your existing account' : 'Finish creating your account'}</h1>
    {challenge ? <GoogleFinishForm kind={challenge.kind} email={challenge.identity.email} /> : <><p className="mt-4 text-sm text-text-secondary">This sign-in request expired or has already been used.</p><Link href="/sign-in" className="mt-6 inline-block text-sm font-semibold text-accent-hover">Back to sign-in</Link></>}
  </section></main>
}

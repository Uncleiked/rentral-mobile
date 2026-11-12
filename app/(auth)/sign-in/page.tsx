import AuthForm from './AuthForm'
import { Suspense } from 'react'
import { AccountPage } from '@/components/layout/AccountPage'
import { getAuthProviders } from '@/lib/auth-providers'

async function ConfiguredAuthForm({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  const query = await searchParams
  const initialError = query.google === 'cancelled' ? 'Google sign-in was cancelled. You can try again or use email.' : query.google === 'failed' ? 'Google sign-in could not be completed. Start again or use your email and password.' : ''
  return <AuthForm providers={await getAuthProviders()} initialError={initialError} />
}
export default function SignInPage({ searchParams }: { searchParams: Promise<{ google?: string | string[] }> }) {
  return <AccountPage><Suspense fallback={<p role="status" className="text-center text-sm text-text-secondary">Loading sign-in...</p>}><ConfiguredAuthForm searchParams={searchParams} /></Suspense></AccountPage>
}

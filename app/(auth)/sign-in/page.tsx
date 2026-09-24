import AuthForm from './AuthForm'
import { Suspense } from 'react'
import { HeroBackground } from '@/components/ui/HeroBackground'
import { getAuthProviders } from '@/lib/auth-providers'

async function ConfiguredAuthForm() {
  return <AuthForm providers={await getAuthProviders()} />
}

export default function SignInPage() {
  return (
    <HeroBackground className="min-h-screen">
      <div className="w-full min-h-screen max-w-md mx-auto p-4 sm:p-6 flex flex-col items-center justify-center">
        <Suspense fallback={<p role="status" className="text-sm text-text-secondary">Loading sign-in...</p>}>
          <ConfiguredAuthForm />
        </Suspense>
      </div>
    </HeroBackground>
  )
}

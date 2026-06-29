import AuthForm from './AuthForm'
import { Suspense } from 'react'
import { HeroBackground } from '@/components/ui/HeroBackground'

export default function SignInPage() {
  return (
    <HeroBackground className="min-h-screen">
      <div className="w-full min-h-screen max-w-md mx-auto p-4 sm:p-6 flex flex-col items-center justify-center">
        <Suspense fallback={null}>
          <AuthForm />
        </Suspense>
      </div>
    </HeroBackground>
  )
}

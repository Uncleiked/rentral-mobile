import OnboardingForm from './OnboardingForm'
import { getOnboardingState } from './actions'

import { HeroBackground } from '@/components/ui/HeroBackground'

export default async function OnboardingPage() {
  const onboardingState = await getOnboardingState()
  const initialError = 'error' in onboardingState ? onboardingState.error : undefined
  const initialState = 'error' in onboardingState ? null : onboardingState

  return (
    <HeroBackground className="min-h-screen">
      <div className="w-full min-h-screen max-w-md mx-auto p-4 sm:p-6 flex flex-col items-center justify-center">
        <OnboardingForm initialState={initialState} initialError={initialError} />
      </div>
    </HeroBackground>
  )
}

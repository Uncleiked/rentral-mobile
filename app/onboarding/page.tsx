import OnboardingForm from './OnboardingForm'
import { getOnboardingState } from './actions'

export default async function OnboardingPage() {
  const onboardingState = await getOnboardingState()
  const initialError = 'error' in onboardingState ? onboardingState.error : undefined
  const initialState = 'error' in onboardingState ? null : onboardingState

  return (
    <div className="min-h-screen bg-background-app flex flex-col items-center justify-center p-4">
      <OnboardingForm initialState={initialState} initialError={initialError} />
    </div>
  )
}

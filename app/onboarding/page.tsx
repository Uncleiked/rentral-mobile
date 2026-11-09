import { redirect } from 'next/navigation'

// Preserve old bookmarks without restarting the removed identity wizard.
export default function OnboardingPage() {
  redirect('/marketplace')
}

import { createClient } from '@/lib/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/marketplace'
  const errorMsg = searchParams.get('error_description') || searchParams.get('error')

  if (errorMsg) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(errorMsg)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      const onboardingComplete =
        user?.app_metadata?.kyc_verified === true &&
        typeof user.app_metadata?.username === 'string' &&
        user.app_metadata.username.length > 0

      if (onboardingComplete) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent('Authentication failed. No code provided.')}`)
}

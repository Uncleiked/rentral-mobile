import { createClient } from '@/lib/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/feed'
  const errorMsg = searchParams.get('error_description') || searchParams.get('error')

  if (errorMsg) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(errorMsg)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check if user has completed KYC
      const { data: { user } } = await supabase.auth.getUser()
      const kycVerified = user?.user_metadata?.kyc_verified === true

      if (kycVerified) {
        return NextResponse.redirect(`${origin}${next}`)
      } else {
        // New or unverified user — route to onboarding
        return NextResponse.redirect(`${origin}/onboarding`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent('Authentication failed. No code provided.')}`)
}

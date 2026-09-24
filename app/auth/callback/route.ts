import { createClient } from '@/lib/server'
import prisma from '@/lib/db'
import { NextResponse } from 'next/server'
import { onboardingComplete, safeAuthNext } from '@/lib/auth-policy'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextUrl = safeAuthNext(searchParams.get('next'), origin)
  const errorMsg = searchParams.get('error_description') || searchParams.get('error')

  if (errorMsg) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(errorMsg)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      // Secure email change sends two confirmation links (old + new inbox).
      // Once both are clicked, Supabase's `user.email` flips to the new
      // address and `user.new_email` clears — mirror that into Prisma here,
      // since there's no separate webhook for email-change confirmation.
      if (user?.email) {
        await prisma.user
          .update({ where: { id: user.id }, data: { email: user.email } })
          .catch((syncError) => {
            console.error('[auth/callback] Failed to sync confirmed email to Prisma:', syncError)
          })
      }

      if (nextUrl.searchParams.get('email_change') === 'check') {
        nextUrl.searchParams.set('email_change', user?.new_email ? 'pending' : 'confirmed')
      }

      if (user && (onboardingComplete(user) || nextUrl.pathname === '/reset-password')) {
        return NextResponse.redirect(nextUrl.toString())
      }

      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent('Authentication failed. No code provided.')}`)
}

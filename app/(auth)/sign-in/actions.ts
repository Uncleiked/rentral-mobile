'use server'

import { createClient } from '@/lib/server'

type AuthResult =
  | { success: true; redirectTo: string; message?: string }
  | { success?: never; redirectTo?: never; message?: never; error: string }

function onboardingComplete(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return (
    user?.app_metadata?.kyc_verified === true &&
    typeof user.app_metadata.username === 'string' &&
    user.app_metadata.username.length > 0 &&
    user?.app_metadata?.profile_completed === true
  )
}

export async function login(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { success: true, redirectTo: onboardingComplete(user) ? '/marketplace' : '/onboarding' }
}

export async function signup(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    console.error('[auth/login/actions] Supabase signup failed:', error.message)
    return { error: error.message }
  }

  if (!data.session) {
    return {
      success: true,
      redirectTo: '/sign-in',
      message: 'Check your email to confirm your account, then sign in.',
    }
  }

  return { success: true, redirectTo: '/onboarding' }
}

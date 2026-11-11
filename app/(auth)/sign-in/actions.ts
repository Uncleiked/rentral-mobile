'use server'

import { createClient } from '@/lib/server'
import { captureServerEvent } from '@/lib/posthog'
import { emailChangeSchema } from '@/lib/schemas'
import { authErrorMessage } from '@/lib/auth-errors'

type AuthResult =
  | { success: true; redirectTo: string; message?: string }
  | { success?: never; redirectTo?: never; message?: never; error: string }

export async function login(formData: FormData): Promise<AuthResult> {
  const client = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const parsed = emailChangeSchema.safeParse({ email })
  if (!parsed.success || !password) return { error: 'Enter your email address and password.' }

  const { error } = await client.auth.signInWithPassword({ email: parsed.data.email, password })

  if (error) {
    return { error: authErrorMessage(error) }
  }

  const {
    data: { user }, error: userError,
  } = await client.auth.getUser()

  if (userError || !user) return { error: authErrorMessage(userError) }
  await captureServerEvent(user.id, 'user_signed_in')

  return { success: true, redirectTo: '/marketplace' }
}

export async function signup(formData: FormData): Promise<AuthResult> {
  const client = await createClient()

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const parsed = emailChangeSchema.safeParse({ email })
  if (!parsed.success) return { error: 'Enter a valid email address.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const accountType = formData.get('accountType')
  if (accountType !== 'individual' && accountType !== 'organization') return { error: 'Choose Individual or Organization before creating your account.' }
  if (formData.get('termsAccepted') !== 'on') return { error: 'Accept the terms and privacy policy before creating your account.' }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { data, error } = await client.auth.signUp({
    email: parsed.data.email, password, accountType,
    options: { emailRedirectTo: new URL('/auth/callback', appUrl).toString() },
  })

  if (error) {
    console.error('[auth/login/actions] Account creation failed.')
    return { error: 'Account creation failed. Check your details or try again shortly.' }
  }

  if (data.user) {
    await captureServerEvent(data.user.id, 'user_signed_up')
  }

  if (!data.session) {
    return {
      success: true,
      redirectTo: '/sign-in',
      message: 'Check your email to confirm your account, then sign in.',
    }
  }

  return { success: true, redirectTo: accountType === 'organization' ? '/onboarding/organization' : '/marketplace' }
}

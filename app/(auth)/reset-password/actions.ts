'use server'

import { createClient } from '@/lib/server'
import { onboardingComplete } from '@/lib/auth-policy'

type ResetPasswordResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string }

export async function updatePassword(formData: FormData): Promise<ResetPasswordResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: 'Your reset link has expired. Request a new one.' }
  }

  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' }
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match.' }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    console.error('[reset-password/actions] Supabase update password failed:', error.message)
    return { success: false, error: 'We could not update your password. Request a new reset link and try again.' }
  }

  return { success: true, redirectTo: onboardingComplete(user) ? '/marketplace' : '/onboarding' }
}

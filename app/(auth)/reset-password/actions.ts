'use server'

import { createClient } from '@/lib/server'

type ResetPasswordResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string }

export async function updatePassword(formData: FormData): Promise<ResetPasswordResult> {
  const supabase = await createClient()

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
    return { success: false, error: error.message }
  }

  return { success: true, redirectTo: '/marketplace' }
}

'use server'

import { resetPassword } from '@/lib/auth/service'

type ResetPasswordResult = { success: true; redirectTo: string } | { success: false; error: string }
export async function updatePassword(formData: FormData): Promise<ResetPasswordResult> {
  const token = String(formData.get('token') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  if (password.length < 8 || password !== confirmPassword) return { success: false, error: 'Use at least 8 characters and make sure both passwords match.' }
  try { await resetPassword({ token, password }); return { success: true, redirectTo: '/sign-in' } }
  catch { return { success: false, error: 'This reset code has expired, has already been used, or could not be checked.' } }
}

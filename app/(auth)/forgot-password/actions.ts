'use server'

import { createClient } from '@/lib/server'
import { headers } from 'next/headers'

type ForgotPasswordResult =
  | { success: true; message: string }
  | { success: false; error: string }

export async function sendPasswordReset(formData: FormData): Promise<ForgotPasswordResult> {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')

  if (!email) {
    return { success: false, error: 'Email is required.' }
  }

  // Determine the origin URL to construct the callback URL
  const headersList = await headers()
  const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    console.error('[forgot-password/actions] Supabase reset password failed:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true, message: 'If an account exists, a reset link has been sent to that email.' }
}

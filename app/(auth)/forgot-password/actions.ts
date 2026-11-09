'use server'

import { createClient } from '@/lib/server'
import { emailChangeSchema } from '@/lib/schemas'

type ForgotPasswordResult =
  | { success: true; message: string }
  | { success: false; error: string }

export async function sendPasswordReset(formData: FormData): Promise<ForgotPasswordResult> {
  const supabase = await createClient()

  const email = String(formData.get('email') ?? '')

  const parsed = emailChangeSchema.safeParse({ email })
  if (!parsed.success) {
    return { success: false, error: 'Enter a valid email address.' }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    console.error('[forgot-password/actions] Supabase reset password failed:', error.message)
    return { success: false, error: 'We could not send a reset link. Please try again shortly.' }
  }

  return { success: true, message: 'If an account exists, its reset code is saved in the local backend’s private email outbox. Use it on the Reset password page.' }
}

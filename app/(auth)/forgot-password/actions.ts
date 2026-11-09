'use server'

import { requestPasswordReset } from '@/lib/auth/service'
import { emailChangeSchema } from '@/lib/schemas'

type ForgotPasswordResult =
  | { success: true; message: string; delivery: 'email' | 'development-outbox' }
  | { success: false; error: string }

export async function sendPasswordReset(formData: FormData): Promise<ForgotPasswordResult> {
  const email = String(formData.get('email') ?? '')

  const parsed = emailChangeSchema.safeParse({ email })
  if (!parsed.success) {
    return { success: false, error: 'Enter a valid email address.' }
  }

  try {
    const result = await requestPasswordReset(parsed.data.email)
    return { success: true, delivery: result.delivery, message: result.delivery === 'email'
      ? 'If an account exists, a recovery message is queued for its inbox. Use the code on the Reset password page.'
      : 'If an account exists, ask your Rentral operator for its recovery code. Use it on the Reset password page.' }
  } catch { return { success: false, error: 'Recovery is temporarily unavailable. Please try again or contact the Rentral operator.' } }
}

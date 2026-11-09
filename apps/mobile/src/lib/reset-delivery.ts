import { z } from 'zod'
import { authDeliverySchema } from '../../../../lib/contracts/account-security'

const resetDeliverySchema = z.object({ delivery: authDeliverySchema }).strict()
export function passwordResetNotice(input: unknown): string {
  const result = resetDeliverySchema.safeParse(input)
  if (!result.success) throw new Error('The reset request could not be confirmed. Check account email delivery before requesting another code.')
  return result.data.delivery === 'email'
    ? 'If this account exists, reset instructions are queued for email delivery. Check your inbox and choose “Use reset code”.'
    : 'If this account exists, ask the backend operator for its reset code from the private development outbox. Then choose “Use reset code”.'
}

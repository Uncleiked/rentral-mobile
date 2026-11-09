export class PaymentEnvironmentMismatchError extends Error {
  readonly code = 'PAYMENT_ENVIRONMENT_MISMATCH'
  constructor() { super('Payment settings changed. Review the saved payment reference with support before preparing checkout in another environment.') }
}
export class PaymentCallbackConfigurationError extends Error {
  readonly code = 'PAYMENT_CALLBACK_UNAVAILABLE'
  constructor() { super('Checkout is unavailable because its return address needs operator configuration. No new payment was prepared.') }
}
/** A saved attempt belongs to exactly one provider mode; unknown legacy modes
 * remain readable but cannot be silently replaced or charged with another key. */
export function assertPaymentEnvironment(saved: string | null | undefined, configured: 'test' | 'live'): void {
  if (saved !== configured) throw new PaymentEnvironmentMismatchError()
}
export function knownTerminalPayment(payment: { status: string; provider_environment: string | null }): boolean {
  return ['failed', 'abandoned'].includes(payment.status) && ['test', 'live'].includes(payment.provider_environment ?? '')
}

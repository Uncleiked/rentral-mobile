export type OperationAction = 'approve' | 'reject' | 'execute' | 'reconcile' | 'finalize' | 'retryRefund'
export const actionLabels: Record<OperationAction, string> = { approve: 'Approve after independent review', reject: 'Reject request', execute: 'Send approved instruction', reconcile: 'Check provider status', finalize: 'Confirm transfer OTP', retryRefund: 'Provide refund bank details' }
export const field = 'mt-1 block w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
export const button = 'min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold text-text-primary hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50'

export function naira(kobo: string): string {
  const value = BigInt(kobo)
  return `₦${(value / BigInt(100)).toLocaleString('en-NG')}.${(value % BigInt(100)).toString().padStart(2, '0')}`
}

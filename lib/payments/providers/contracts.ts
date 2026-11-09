/** Provider values stay exact across JSON, MongoDB and independently retried jobs. */
export type ProviderEnvironment = 'test' | 'live'
export type CollectionStatus = 'abandoned' | 'failed' | 'ongoing' | 'pending' | 'processing' | 'queued' | 'reversed' | 'success'
export type TransferStatus = 'pending' | 'otp' | 'received' | 'success' | 'failed' | 'reversed' | 'blocked' | 'rejected' | 'abandoned'
export type RefundStatus = 'pending' | 'processing' | 'needs-attention' | 'processed' | 'failed'
export type FinancialOperationStatus = 'requested' | 'approved' | 'rejected' | 'submitting' | 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'reversed' | 'uncertain'

export interface ProviderCollection {
  provider: 'paystack'
  environment: ProviderEnvironment
  providerId: string
  reference: string
  status: CollectionStatus
  amountKobo: string
  currency: 'NGN'
  customerEmail: string
  metadata: { paymentId: string; userId: string }
}

export interface ProviderTransfer {
  provider: 'paystack'
  environment: ProviderEnvironment
  providerId: string
  reference: string
  transferCode: string
  status: TransferStatus
  amountKobo: string
  currency: 'NGN'
  /** Initiation can return only a numeric recipient ID. Reconciliation must resolve the code. */
  recipientCode: string | null
}

export interface ProviderRefund {
  provider: 'paystack'
  environment: ProviderEnvironment
  providerId: string
  /** Older refund/retry responses can omit their reference. Fetch/list before settlement. */
  reference: string | null
  transactionId: string
  transactionReference: string | null
  status: RefundStatus
  amountKobo: string
  currency: 'NGN'
}

/** Transient server-side response. Never persist or log the whole object. */
export interface ResolvedBankAccount { accountNumber: string; accountName: string; bankCode: string }
export interface ProviderRecipient {
  provider: 'paystack'
  environment: ProviderEnvironment
  providerId: string
  recipientCode: string
  active: boolean
  currency: 'NGN'
  accountNumber: string
  accountName: string | null
  bankCode: string
}

export interface ProviderBank { id: string; code: string; name: string; active: boolean }

export function transferOperationStatus(status: TransferStatus): FinancialOperationStatus {
  if (status === 'success') return 'succeeded'
  if (status === 'reversed') return 'reversed'
  if (status === 'otp' || status === 'received') return 'requires_action'
  if (status === 'pending') return 'pending'
  return 'failed'
}

export function refundOperationStatus(status: RefundStatus): FinancialOperationStatus {
  if (status === 'processed') return 'succeeded'
  if (status === 'needs-attention') return 'requires_action'
  return status === 'failed' ? 'failed' : 'pending'
}

export function transferBindingMatches(value: ProviderTransfer, expected: {
  environment: ProviderEnvironment; reference: string; amountKobo: bigint; recipientCode: string
}): boolean {
  return value.environment === expected.environment && value.currency === 'NGN' && value.reference === expected.reference
    && value.amountKobo === expected.amountKobo.toString() && value.recipientCode === expected.recipientCode
}

export function refundBindingMatches(value: ProviderRefund, expected: {
  environment: ProviderEnvironment; reference: string; transactionId: string; amountKobo: bigint
}): boolean {
  return value.environment === expected.environment && value.currency === 'NGN'
    && value.reference?.toLowerCase() === expected.reference.toLowerCase()
    && value.transactionId === expected.transactionId && value.amountKobo === expected.amountKobo.toString()
}

import { ApiError } from './http'
import { FinancialError } from '@/lib/payments/financial-policy'
import { PaystackError } from '@/lib/payments/providers/paystack/client'
import { MongoReadinessError } from '@/lib/database/readiness'

export function financialApiError(error: unknown): unknown {
  if (error instanceof FinancialError) return new ApiError(error.status, error.code, error.message)
  if (error instanceof PaystackError && error.code === 'INVALID_INPUT') return new ApiError(400, 'INVALID_REQUEST', 'Check the provider request details and server mode configuration.')
  if (error instanceof PaystackError) return new ApiError(error.uncertain ? 409 : 503, error.uncertain ? 'FINANCIAL_OUTCOME_UNCERTAIN' : 'PROVIDER_UNAVAILABLE',
    error.uncertain ? 'The provider result is uncertain. Refresh history and reconcile the existing request before trying again.' : 'The provider is unavailable. Your existing instructions have been preserved.')
  if (error instanceof MongoReadinessError) return new ApiError(503, error.code, error.code === 'DATABASE_SETUP_REQUIRED'
    ? 'Financial features need the reviewed database preparation.' : 'The database is temporarily unavailable.')
  if (error instanceof Error && error.message === 'Staff access required.') return new ApiError(403, 'FORBIDDEN', 'Current financial staff authorization is required.')
  return error
}

import { z } from 'zod'
import { ApiError, apiFailure } from './http'
import { MutationConflictError } from '@/lib/database/mutations'

export const adminIdSchema = z.uuid()
export function adminFailure(error: unknown, scope: string, started = false): Response {
  if (error instanceof MutationConflictError) return apiFailure(new ApiError(409, error.code, error.message), scope)
  if (error instanceof Error && error.message === 'Staff access required.') return apiFailure(new ApiError(403, 'STAFF_REQUIRED', 'Your current account does not have this administrative permission.'), scope)
  if (started && !(error instanceof ApiError) && !(error instanceof z.ZodError) && !(error instanceof Error && error.name === 'MongoReadinessError')) return apiFailure(new ApiError(503, 'ADMIN_UPDATE_UNCONFIRMED', 'The administrative result could not be confirmed. Read back the original request before trying again.'), scope)
  return apiFailure(error, scope)
}

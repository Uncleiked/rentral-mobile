import { z } from 'zod'
import { ApiError, apiFailure } from '@/lib/api/http'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { AuthError } from './types'
import { MongoReadinessError } from '@/lib/database/readiness'

export function authLimit(request: Request): void {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    let local = false
    try { const url = new URL(origin); local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) } catch { local = false }
    if (!local) throw new ApiError(403, 'ORIGIN_REJECTED', 'This request must come from Rentral.')
  }
  const remote = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
  if (!apiRateLimiter.allow(`auth:${remote}`, 15)) throw new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a minute.')
}
export function authFailure(error: unknown): Response {
  if (error instanceof ApiError) return apiFailure(error, 'auth')
  if (error instanceof AuthError) return apiFailure(new ApiError(error.status, error.code, error.message), 'auth')
  if (error instanceof MongoReadinessError) return apiFailure(new ApiError(error.status, error.code, error.message), 'auth')
  if (error instanceof z.ZodError) return apiFailure(new ApiError(400, 'INVALID_REQUEST', 'Check your email and password. Use at least 8 characters for a new password.'), 'auth')
  // Record only a safe classification; provider messages can contain account
  // data, document contents or connection credentials.
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  console.error('[auth] Service unavailable', {
    type: error instanceof Error ? error.name : 'UnknownError',
    ...(typeof code === 'string' && /^P[0-9]{4}$/.test(code) ? { code } : {}),
  })
  return apiFailure(new ApiError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Check the local database setup and try again.'), 'auth')
}

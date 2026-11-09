import { z } from 'zod'
import { MongoReadinessError } from '@/lib/database/readiness'
import { MatchingError } from '@/lib/matching/policy'
import { ApiError, apiFailure, readApiJson } from './http'

export type MatchingRouteContext = { params: Promise<{ id: string }> }
export function validatedMatchingResult<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError(503, 'MATCH_UPDATE_UNCONFIRMED', 'The result could not be verified. Refresh your contacts or request history before trying again.')
  return parsed.data
}
export function createdMatchingResult(id: unknown): { id: string } { return validatedMatchingResult(z.object({ id: z.uuid() }).strict(), { id }) }
export async function emptyMatchingBody(request: Request): Promise<void> {
  if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024))
}
export function matchingFailure(error: unknown, scope: string, uncertain = false): Response {
  if (error instanceof MongoReadinessError) return apiFailure(new ApiError(503, error.code, error.message), scope)
  if (error instanceof MatchingError) {
    const response = apiFailure(new ApiError(error.status, error.code, error.message), scope)
    if (['CONTACT_RATE_LIMITED', 'REPORT_RATE_LIMITED'].includes(error.code)) response.headers.set('Retry-After', '86400')
    return response
  }
  if (error instanceof Error && error.message === 'Staff access required.') return apiFailure(new ApiError(403, 'FORBIDDEN', 'Staff access required.'), scope)
  if (uncertain && !(error instanceof ApiError) && !(error instanceof z.ZodError)) return apiFailure(new ApiError(503, 'MATCH_UPDATE_UNCONFIRMED', 'The update could not be confirmed. Refresh your contacts or report history before trying again.'), scope)
  return apiFailure(error, scope)
}

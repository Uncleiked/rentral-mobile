import { z } from 'zod'
import { PushError } from '@/lib/push/policy'
import { MongoReadinessError } from '@/lib/database/readiness'
import { AccountUnavailableError } from '@/lib/accounts/availability'
import { ApiError, apiFailure, readApiJson } from './http'
export function pushFailure(error: unknown, scope: string, uncertain = false): Response {
  if (error instanceof PushError) return apiFailure(new ApiError(error.status, error.code, error.message), scope)
  if (uncertain && !(error instanceof ApiError) && !(error instanceof z.ZodError) && !(error instanceof MongoReadinessError) && !(error instanceof AccountUnavailableError)) return apiFailure(new ApiError(503, 'PUSH_UPDATE_UNCONFIRMED', 'The device update could not be confirmed. Refresh your registered devices before trying again.'), scope)
  return apiFailure(error, scope)
}
export async function emptyPushBody(request: Request): Promise<void> { if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024)) }
export function publicPushResult<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError(503, 'PUSH_DATA_UNAVAILABLE', 'Device details could not be verified. Refresh before changing this registration.')
  return result.data
}

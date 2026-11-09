import { z } from 'zod'
import prisma from '@/lib/db'
import { CommercialError } from '@/lib/commerce/policy'
import { MongoReadinessError } from '@/lib/database/readiness'
import { AccountUnavailableError } from '@/lib/accounts/availability'
import { archiveQuerySchema } from './archive'
import { ApiError, apiFailure, readApiJson } from './http'

export const commercialQuerySchema = archiveQuerySchema.safeExtend({ limit: z.coerce.number().int().min(1).max(25).default(20) })
export type CommercialRouteContext = { params: Promise<{ id: string }> }
export function commercialFailure(error: unknown, scope: string, uncertain = false): Response {
  if (error instanceof CommercialError) {
    const response = apiFailure(new ApiError(error.status, error.code, error.message), scope)
    if (error.status === 429) response.headers.set('Retry-After', '86400')
    return response
  }
  if (error instanceof Error && error.message === 'Staff access required.') return apiFailure(new ApiError(403, 'FORBIDDEN', 'Staff access required.'), scope)
  if (uncertain && !(error instanceof ApiError) && !(error instanceof z.ZodError) && !(error instanceof MongoReadinessError) && !(error instanceof AccountUnavailableError)) return apiFailure(new ApiError(503, 'COMMERCIAL_UPDATE_UNCONFIRMED', 'The update could not be confirmed. Refresh the original purchase or campaign before trying again.'), scope)
  return apiFailure(error, scope)
}
export async function emptyCommercialBody(request: Request): Promise<void> {
  if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024))
}
export async function requireCommercialReference(userId: string, orderId: string, reference: string): Promise<void> {
  const payment = await prisma.paymentIntent.findFirst({ where: { user_id: userId, order_id: orderId, kind: 'commercial', reference }, select: { id: true } })
  if (!payment) throw new ApiError(404, 'NOT_FOUND', 'This purchase payment is unavailable.')
}

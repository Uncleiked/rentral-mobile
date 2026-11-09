import { z } from 'zod'
import { publicationFeeCheckoutSchema, publicationFeeReferenceSchema, publicationFeeSchema } from '../../../../lib/contracts/listing-payments'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'

export type PublicationFee = z.infer<typeof publicationFeeSchema>
export type PreparedPublicationCheckout = z.infer<typeof publicationFeeCheckoutSchema> & { actorId: string; listingId: string }
export function canOpenPublicationCheckout(fee: PublicationFee): boolean {
  return fee.actions.checkout && fee.paymentAvailable && fee.environment !== null && !fee.archived && fee.listingStatus === 'pending_verification'
    && (!fee.payment || ['failed', 'abandoned'].includes(fee.payment.status) || fee.payment.environment === fee.environment && ['created', 'pending'].includes(fee.payment.status))
}
export function canReopenPublicationCheckout(fee: PublicationFee, prepared: PreparedPublicationCheckout, actorId: string, listingId: string): boolean {
  return prepared.actorId === actorId && prepared.listingId === listingId && fee.listingId === listingId && canOpenPublicationCheckout(fee)
    && prepared.environment === fee.environment && fee.payment?.environment === prepared.environment && fee.payment.id === prepared.paymentId
    && fee.payment.reference === prepared.reference && ['created', 'pending'].includes(fee.payment.status)
}
export function currentPublicationFeeVerified(fee: PublicationFee): boolean {
  return fee.payment?.status === 'succeeded' && fee.environment !== null && fee.payment.environment === fee.environment
}
export const publicationFeePath = (listingId: string) => `/my-listings/${z.uuid().parse(listingId)}/publication-fee`
export const publicationFeeFor = (listingId: string) => publicationFeeSchema.refine(value => value.listingId === listingId, { message: 'The payment does not match this listing.' })
function matched(listingId: string, value: unknown): PublicationFee {
  const result = memberResponse(publicationFeeSchema, value)
  if (result.listingId !== listingId) throw new ApiError('This publication payment could not be matched to your listing. Refresh before continuing.', 'INVALID_RESPONSE', 200)
  return result
}
export async function loadPublicationFee(listingId: string, actorId: string) {
  return matched(listingId, await api<unknown>(publicationFeePath(listingId), { expectedUserId: actorId }))
}
export async function preparePublicationCheckout(listingId: string, actorId: string) {
  return memberResponse(publicationFeeCheckoutSchema, await api<unknown>(`${publicationFeePath(listingId)}/checkout`, { method: 'POST', body: {}, expectedUserId: actorId }))
}
export async function reconcilePublicationFee(listingId: string, reference: string, actorId: string) {
  const checked = publicationFeeReferenceSchema.parse(reference)
  return matched(listingId, await api<unknown>(`${publicationFeePath(listingId)}/reconcile`, { method: 'POST', body: { reference: checked }, expectedUserId: actorId }))
}

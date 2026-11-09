import { z } from 'zod'
import { listingMutationResultSchema, ownerDocumentSchema, ownerListingDetailSchema, saveDraftInputSchema, saveListingInputSchema, updateListingInputSchema, uploadedObjectInfoSchema } from '../../../../lib/contracts/listings'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'

export type OwnerSaveCommand = { mode: 'draft'; listing: z.infer<typeof saveDraftInputSchema> } | { mode: 'submit'; listing: z.infer<typeof saveListingInputSchema> }
export async function saveOwnerListing(input: OwnerSaveCommand, actorId: string) {
  const command = input.mode === 'draft' ? { mode: input.mode, listing: saveDraftInputSchema.strict().parse(input.listing) } : { mode: input.mode, listing: saveListingInputSchema.strict().parse(input.listing) }
  if (!command.listing.clientId) throw new Error('Save this request identifier before sending your listing.')
  const result = memberResponse(listingMutationResultSchema, await api<unknown>('/my-listings', { method: 'POST', body: command, expectedUserId: actorId }))
  if (command.listing.draftId && result.id !== command.listing.draftId) throw new ApiError('This listing save could not be confirmed. Keep the original request and check My listings.', 'INVALID_RESPONSE', 200)
  return result
}
export async function editOwnerListing(id: string, input: z.infer<typeof updateListingInputSchema>, actorId: string) {
  const { listingId, ...listing } = updateListingInputSchema.strict().parse(input)
  if (listingId !== id) throw new Error('Open the correct listing before editing.')
  const updated = memberResponse(ownerListingDetailSchema, await api<unknown>(`/my-listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: { operation: 'update', listing }, expectedUserId: actorId }))
  if (updated.id !== id) throw new ApiError('This listing update could not be confirmed. Refresh My listings before continuing.', 'INVALID_RESPONSE', 200)
  return updated
}
export async function archiveOwnerListing(id: string, archived: boolean, actorId: string) {
  const updated = memberResponse(ownerListingDetailSchema, await api<unknown>(`/my-listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: { operation: 'archive', archived }, expectedUserId: actorId }))
  if (updated.id !== id || Boolean(updated.archivedAt) !== archived) throw new ApiError('This archive change could not be confirmed. Refresh My listings before continuing.', 'INVALID_RESPONSE', 200)
  return updated
}
export async function ownerDocumentLink(id: string) {
  return memberResponse(ownerDocumentSchema, await api<unknown>(`/my-listings/${encodeURIComponent(id)}/document`))
}
export async function confirmOwnedUpload(bucket: 'listings-media' | 'compliance-docs', path: string, expected: { size: number; contentType: string }, actorId: string) {
  const result = memberResponse(uploadedObjectInfoSchema, await api<unknown>(`/uploads/${bucket}/info?path=${encodeURIComponent(path)}`, { expectedUserId: actorId }))
  if (result.path !== path || result.size !== expected.size || result.contentType !== expected.contentType) throw new ApiError('This uploaded file does not match the saved upload instructions. Keep your original file for recovery.', 'INVALID_RESPONSE', 200)
  return result
}

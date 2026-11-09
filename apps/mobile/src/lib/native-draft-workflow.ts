import { saveDraftInputSchema, saveListingInputSchema } from '../../../../lib/contracts/listings'
import { listingFormError, nativeListingMetadata } from './native-listing'
import type { NativeDeviceDraft, NativeDraftCommand } from './native-draft-store'
import { ApiError } from './api'

export function canClearDeclinedDraft(reason: unknown, restoring: boolean, acknowledged: boolean): boolean {
  return !restoring && !acknowledged && reason instanceof ApiError && reason.status >= 400 && reason.status < 500
    && !['INVALID_RESPONSE', 'INVALID_RETRY', 'ACCOUNT_CHANGED'].includes(reason.code)
}

export function buildNativeDraftCommand(draft: NativeDeviceDraft, mode: 'draft' | 'submit', clientId: string): NativeDraftCommand {
  if (draft.pending) throw new Error('Confirm the saved listing request before preparing another.')
  if (draft.capture && draft.videoUpload?.state !== 'uploaded') throw new Error('Upload and confirm your walkthrough before saving this server draft.')
  if (draft.document && draft.documentUpload?.state !== 'uploaded') throw new Error('Upload and confirm your private document before saving this server draft.')
  const videoPath = draft.videoUpload?.state === 'uploaded' ? draft.videoUpload.upload.path : draft.server?.videoPath ?? undefined
  const documentPath = draft.documentUpload?.state === 'uploaded' ? draft.documentUpload.upload.path : draft.server?.documentPath ?? undefined
  if (draft.capture && draft.videoUpload?.upload.uri !== draft.capture.uri) throw new Error('Your saved upload does not match the current walkthrough.')
  if (draft.document && draft.documentUpload?.upload.uri !== draft.document.uri) throw new Error('Your saved upload does not match the current private document.')
  const input = { clientId, category: draft.category, ...(draft.server ? { draftId: draft.server.id, expectedRevision: draft.server.revision } : {}),
    address: draft.form.address.trim(), basePrice: draft.form.basePrice, metadata: nativeListingMetadata(draft.category, draft.form),
    ...(videoPath ? { videoPath } : {}), ...(documentPath ? { documentPath } : {}), ...(draft.server?.posterPath ? { posterPath: draft.server.posterPath } : {}),
    ...(draft.capture ? { lat: draft.capture.lat, lng: draft.capture.lng, accuracy: draft.capture.accuracy } : {}),
  }
  if (mode === 'draft') return { mode, listing: saveDraftInputSchema.strict().parse({ ...input, wizardStep: !videoPath ? 'capture' : !draft.form.address || !draft.form.basePrice ? 'details' : !documentPath ? 'documents' : 'checkout' }) }
  const invalid = listingFormError(draft.category, draft.form)
  if (invalid) throw new Error(invalid)
  if (!videoPath || (!draft.capture && !draft.server?.hasCoords)) throw new Error('Record a walkthrough with its capture location, or resume the unchanged server recording.')
  if (!documentPath) throw new Error('Choose an ownership or listing-authority document before submitting.')
  return { mode, listing: saveListingInputSchema.strict().parse(input) }
}

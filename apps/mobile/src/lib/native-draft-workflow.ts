import { saveDraftInputSchema, saveListingInputSchema } from '../../../../lib/contracts/listings'
import { listingFormError, nativeListingMetadata } from './native-listing'
import type { NativeDeviceDraft, NativeDraftCommand } from './native-draft-store'
import { ApiError } from './api'
import { captureAddressKey } from './native-capture-policy'
import type { CaptureAddressFailureReason, CaptureStatus } from '../../../../lib/contracts/capture'

export type NativeAddressCheck = { captureId: string; addressKey: string; status: 'matched' | 'mismatch' | 'unavailable'; reason?: CaptureAddressFailureReason }
export function nativeDraftUsesGallery(draft: NativeDeviceDraft): boolean { return (draft.mediaSource ?? draft.server?.mediaSource) === 'approved_gallery' }
export function draftCaptureId(draft: NativeDeviceDraft): string | null { return draft.capture ? draft.capture.captureId ?? null : draft.server?.captureId ?? null }
export function nativeAddressCheckMatches(draft: NativeDeviceDraft, check: NativeAddressCheck | null): boolean {
  return Boolean(check && check.status === 'matched' && draftCaptureId(draft) === check.captureId && captureAddressKey(draft.form.address) === check.addressKey)
}
export function isLegacyDraftCommand(command: NativeDraftCommand): boolean {
  if (command.listing.mediaSource === 'approved_gallery') return false
  return ['lat', 'lng', 'accuracy'].some(key => key in command.listing) || Boolean(command.listing.videoPath && !command.listing.captureId)
}
export function recoveredCaptureSession(draft: NativeDeviceDraft, status: CaptureStatus): NonNullable<NativeDeviceDraft['captureSession']> {
  const current = draft.captureSession
  if (!current || current.id !== status.id) throw new Error('This recording status belongs to another saved walkthrough.')
  if (status.listingId && status.listingId !== draft.server?.id) throw new Error('This recording is already attached to a saved listing. Check My listings before changing the draft.')
  if (status.status === 'sealed') {
    const expectedPath = current.sealPath ?? draft.videoUpload?.upload.path
    if (!draft.capture || draft.capture.captureId !== status.id || !expectedPath || status.videoPath !== expectedPath) throw new Error('This recording is bound to a different uploaded walkthrough. Keep your recovery and review My listings.')
    return { ...current, phase: 'sealed', status, finishInput: null, sealPath: expectedPath }
  }
  if (status.status === 'recorded' && draft.capture?.captureId === status.id) return { ...current, phase: 'recorded', status, finishInput: null, sealPath: null }
  // A started camera recording cannot resume after a process crash or an unknown
  // start acknowledgment. Preserve evidence; require an explicit fresh take.
  return { ...current, phase: status.status === 'expired' ? 'expired' : 'interrupted', status, finishInput: null, sealPath: null }
}

export function canClearDeclinedDraft(reason: unknown, restoring: boolean, acknowledged: boolean): boolean {
  return !restoring && !acknowledged && reason instanceof ApiError && reason.status >= 400 && reason.status < 500
    && !['INVALID_RESPONSE', 'INVALID_RETRY', 'ACCOUNT_CHANGED'].includes(reason.code)
}

export function buildNativeDraftCommand(draft: NativeDeviceDraft, mode: 'draft' | 'submit', clientId: string): NativeDraftCommand {
  if (draft.pending) throw new Error('Confirm the saved listing request before preparing another.')
  if (nativeDraftUsesGallery(draft)) return buildGalleryDraftCommand(draft, mode, clientId)
  if (draft.capture && draft.videoUpload?.state !== 'uploaded') throw new Error('Upload and confirm your walkthrough before saving this server draft.')
  if (draft.document && draft.documentUpload?.state !== 'uploaded') throw new Error('Upload and confirm your private document before saving this server draft.')
  const videoPath = draft.videoUpload?.state === 'uploaded' ? draft.videoUpload.upload.path : draft.server?.videoPath ?? undefined
  const documentPath = draft.documentUpload?.state === 'uploaded' ? draft.documentUpload.upload.path : draft.server?.documentPath ?? undefined
  if (draft.capture && draft.videoUpload?.upload.uri !== draft.capture.uri) throw new Error('Your saved upload does not match the current walkthrough.')
  if (draft.document && draft.documentUpload?.upload.uri !== draft.document.uri) throw new Error('Your saved upload does not match the current private document.')
  const captureId = videoPath ? draftCaptureId(draft) : null
  if (videoPath && !captureId) throw new Error('This earlier walkthrough has no backend recording-location lock. Keep the draft and record a fresh walkthrough before saving it.')
  if (draft.capture && (draft.captureSession?.phase !== 'sealed' || draft.captureSession.id !== captureId || draft.captureSession.status?.videoPath !== videoPath)) throw new Error('Confirm the uploaded walkthrough and its backend location binding before saving.')
  const input = { clientId, category: draft.category, ...(draft.server ? { draftId: draft.server.id, expectedRevision: draft.server.revision } : {}),
    address: draft.form.address.trim(), basePrice: draft.form.basePrice, metadata: nativeListingMetadata(draft.category, draft.form),
    ...(videoPath ? { videoPath } : {}), ...(documentPath ? { documentPath } : {}), ...(draft.server?.posterPath ? { posterPath: draft.server.posterPath } : {}),
    ...(captureId ? { captureId } : {}),
  }
  if (mode === 'draft') return { mode, listing: saveDraftInputSchema.strict().parse({ ...input, wizardStep: !videoPath ? 'capture' : !draft.form.address || !draft.form.basePrice ? 'details' : !documentPath ? 'documents' : 'checkout' }) }
  const invalid = listingFormError(draft.category, draft.form)
  if (invalid) throw new Error(invalid)
  if (!videoPath || !captureId || (!draft.capture && !draft.server?.hasCoords)) throw new Error('Record a walkthrough with its capture location, or resume the unchanged server recording.')
  if (!documentPath) throw new Error('Choose an ownership or listing-authority document before submitting.')
  return { mode, listing: saveListingInputSchema.strict().parse(input) }
}

function buildGalleryDraftCommand(draft: NativeDeviceDraft, mode: 'draft' | 'submit', clientId: string): NativeDraftCommand {
  const files = draft.galleryFiles ?? []
  if (files.some(item => item.upload?.state !== 'uploaded' || item.upload.upload.uri !== item.uri)) throw new Error('Upload and confirm every selected gallery file before saving this server draft.')
  if (draft.document && (draft.documentUpload?.state !== 'uploaded' || draft.documentUpload.upload.uri !== draft.document.uri)) throw new Error('Upload and confirm the selected authority document before saving.')
  const selectedPhotos = files.filter(item => item.kind === 'photo').map(item => item.upload!.upload.path)
  const galleryPhotos = selectedPhotos.length ? selectedPhotos : draft.server?.mediaSource === 'approved_gallery' ? draft.server.galleryPhotos ?? [] : []
  const videoPath = files.find(item => item.kind === 'video')?.upload?.upload.path ?? (draft.server?.mediaSource === 'approved_gallery' ? draft.server.videoPath : null)
  const documentPath = draft.documentUpload?.state === 'uploaded' ? draft.documentUpload.upload.path : draft.server?.documentPath
  const input = { clientId, category: draft.category, mediaSource: 'approved_gallery' as const, galleryPhotos,
    ...(draft.server ? { draftId: draft.server.id, expectedRevision: draft.server.revision } : {}), address: draft.form.address.trim(), basePrice: draft.form.basePrice,
    metadata: nativeListingMetadata(draft.category, draft.form), ...(videoPath ? { videoPath } : {}), ...(documentPath ? { documentPath } : {}), ...(galleryPhotos[0] ? { posterPath: galleryPhotos[0] } : {}) }
  if (mode === 'draft') return { mode, listing: saveDraftInputSchema.strict().parse({ ...input, wizardStep: !videoPath && !galleryPhotos.length ? 'capture' : !draft.form.address || !draft.form.basePrice ? 'details' : !documentPath ? 'documents' : 'checkout' }) }
  const invalid = listingFormError(draft.category, draft.form); if (invalid) throw new Error(invalid)
  if (!videoPath && !galleryPhotos.length) throw new Error('Choose at least one gallery photo or a video before submitting.')
  if (!documentPath) throw new Error('Choose an ownership or listing-authority document before submitting.')
  return { mode, listing: saveListingInputSchema.strict().parse(input) }
}

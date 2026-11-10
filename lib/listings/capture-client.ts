import { z } from 'zod'
import { captureReadingSchema, captureStatusSchema, type CaptureReading } from '../contracts/capture'
import { listingMutationResultSchema } from '../contracts/listings'
import { isWizardCurrent, useRentralStore } from '../../store/useRentralStore'
import type { WebListingCommand, WizardIdentity } from './wizard-recovery'

export class CaptureRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly code = 'UNCONFIRMED') { super(message) }
}

// The actor rendered with this wizard only restricts the ambient cookie session.
// It cannot select or authenticate another account.
export async function listingRequest<T>(actorId: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  if (!z.string().uuid().safeParse(actorId).success) throw new CaptureRequestError('Sign in to continue.', 401, 'UNAUTHORIZED')
  let response: Response
  try {
    response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Rentral-Account': actorId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) })
  } catch { throw new CaptureRequestError('The request could not be confirmed. Check its saved status before trying again.') }
  let envelope: unknown
  try { envelope = await response.json() } catch { throw new CaptureRequestError('The server response could not be confirmed.', response.status, 'INVALID_RESPONSE') }
  const failure = z.object({ success: z.literal(false), error: z.string().max(1000), code: z.string().max(100).optional() }).safeParse(envelope)
  if (failure.success) throw new CaptureRequestError(failure.data.error, response.status, failure.data.code)
  const success = z.object({ success: z.literal(true), data: schema }).safeParse(envelope)
  if (!response.ok || !success.success) throw new CaptureRequestError('The server response could not be confirmed.', response.status, 'INVALID_RESPONSE')
  return success.data.data
}

export function browserCaptureReading(position: GeolocationPosition, now = Date.now()): CaptureReading {
  const reading = captureReadingSchema.parse({ latitude: position.coords.latitude, longitude: position.coords.longitude,
    accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() })
  if (Math.abs(now - position.timestamp) > 15000) throw new CaptureRequestError('A fresh, precise GPS reading is needed. Enable precise location and try outdoors.', 400, 'GPS_STALE')
  return reading
}

export function browserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new CaptureRequestError('This device cannot provide its recording location.', 400, 'GPS_UNAVAILABLE')); return }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new CaptureRequestError('Allow precise location and try outdoors. A fresh GPS reading is required.', 400, 'GPS_UNAVAILABLE')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  })
}

export async function sealBrowserCapture(actorId: string, captureId: string, videoPath: string, identity?: WizardIdentity): Promise<void> {
  // Readback first recovers a previously accepted seal without replaying a POST.
  const current = await listingRequest(actorId, `/api/v1/captures/${captureId}`, captureStatusSchema)
  if (identity) assertWizardCurrent(identity)
  if (current.id !== captureId) throw new CaptureRequestError('This capture readback belongs to another walkthrough.', 200, 'INVALID_RESPONSE')
  if (current.status === 'sealed') {
    if (current.videoPath !== videoPath) throw new CaptureRequestError('This recording location belongs to a different video. Record a fresh walkthrough.', 409, 'CAPTURE_VIDEO_CHANGED')
    return
  }
  if (current.status !== 'recorded') throw new CaptureRequestError('This recording location is incomplete or expired. Record a fresh walkthrough.', 409, 'CAPTURE_INCOMPLETE')
  const sealed = await listingRequest(actorId, `/api/v1/captures/${captureId}/seal`, captureStatusSchema, { videoPath })
  if (identity) assertWizardCurrent(identity)
  if (sealed.id !== captureId || sealed.status !== 'sealed' || sealed.videoPath !== videoPath) throw new CaptureRequestError('The video location binding could not be confirmed.')
}

export function assertWizardCurrent(identity: WizardIdentity): void {
  if (!isWizardCurrent(identity.actorId, identity.generation) || identity.isActive?.() === false) throw new CaptureRequestError('This listing session changed. Reopen its saved recovery before continuing.', 409, 'WIZARD_CHANGED')
}
export async function executeWebListingCommand(identity: WizardIdentity, command: WebListingCommand, retry = false) {
  assertWizardCurrent(identity)
  const saved = useRentralStore.getState().claimListingCommand(command.listing.clientId)
  if (JSON.stringify(saved) !== JSON.stringify(command)) throw new CaptureRequestError('The saved listing instructions changed. Check the original request.', 409, 'INVALID_RETRY')
  try {
    if (saved.listing.captureId && saved.listing.videoPath) {
      await sealBrowserCapture(identity.actorId, saved.listing.captureId, saved.listing.videoPath, identity)
      assertWizardCurrent(identity)
    }
    const result = await listingRequest(identity.actorId, '/api/v1/my-listings', listingMutationResultSchema, saved)
    assertWizardCurrent(identity)
    if (saved.listing.draftId && result.id !== saved.listing.draftId || result.status !== (saved.mode === 'draft' ? 'draft' : 'pending_verification')) throw new CaptureRequestError('The listing save could not be confirmed.', 200, 'INVALID_RESPONSE')
    return result
  } catch (reason) {
    // A retried unknown result remains recoverable even after a later refusal.
    // Initial definite validation failures can safely return to the editable form.
    if (!retry && identity.isActive?.() !== false && isWizardCurrent(identity.actorId, identity.generation) && reason instanceof CaptureRequestError && reason.status >= 400 && reason.status < 500 && !['ACCOUNT_CHANGED','INVALID_RETRY','INVALID_RESPONSE','WIZARD_CHANGED'].includes(reason.code)) useRentralStore.getState().completeListingCommand(saved.listing.clientId)
    throw reason
  }
}

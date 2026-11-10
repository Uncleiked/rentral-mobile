import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { beginCaptureInputSchema, captureAddressResultSchema, captureStatusSchema, checkCaptureAddressInputSchema, finishCaptureInputSchema, sealCaptureInputSchema, type CaptureReading, type CaptureStatus } from '../../../../lib/contracts/capture'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
import { captureAddressKey } from './native-capture-policy'
export { captureAddressKey, nativeCaptureReading } from './native-capture-policy'

function captureResponse(value: unknown, id: string): CaptureStatus {
  const result = memberResponse(captureStatusSchema, value)
  const invalidStage = result.status === 'recording' ? Boolean(result.finishedAt || result.sealBy || result.videoPath || result.listingId)
    : result.status === 'recorded' ? !result.finishedAt || !result.sealBy || Boolean(result.videoPath || result.listingId)
      : result.status === 'sealed' ? !result.finishedAt || !result.sealBy || !result.videoPath : false
  if (result.id !== id || invalidStage || Date.parse(result.finishBy) <= Date.parse(result.startedAt)) throw new ApiError('This recording location could not be confirmed. Check its saved status before continuing.', 'INVALID_RESPONSE', 200)
  return result
}
export async function beginNativeCapture(id: string, reading: CaptureReading, actorId: string): Promise<CaptureStatus> {
  const body = beginCaptureInputSchema.parse({ id, reading })
  const result = captureResponse(await api<unknown>('/captures', { method: 'POST', body, expectedUserId: actorId }), id)
  if (result.status !== 'recording' || result.finishedAt || result.videoPath || result.listingId) throw new ApiError('This location session is not available for a new recording. Check its saved status.', 'INVALID_RESPONSE', 200)
  return result
}
export async function readNativeCapture(id: string, actorId: string): Promise<CaptureStatus> {
  z.string().uuid().parse(id)
  return captureResponse(await api<unknown>(`/captures/${id}`, { expectedUserId: actorId }), id)
}
export async function finishNativeCapture(id: string, input: z.infer<typeof finishCaptureInputSchema>, actorId: string): Promise<CaptureStatus> {
  z.string().uuid().parse(id)
  const result = captureResponse(await api<unknown>(`/captures/${id}/finish`, { method: 'POST', body: finishCaptureInputSchema.parse(input), expectedUserId: actorId }), id)
  if (result.status !== 'recorded' || !result.finishedAt || !result.sealBy || result.videoPath || result.listingId) throw new ApiError('The end of this recording could not be confirmed. Check its saved status before continuing.', 'INVALID_RESPONSE', 200)
  return result
}
export async function sealNativeCapture(id: string, videoPath: string, actorId: string): Promise<CaptureStatus> {
  z.string().uuid().parse(id)
  const result = captureResponse(await api<unknown>(`/captures/${id}/seal`, { method: 'POST', body: sealCaptureInputSchema.parse({ videoPath }), expectedUserId: actorId }), id)
  if (result.status !== 'sealed' || result.videoPath !== videoPath || !result.finishedAt) throw new ApiError('The uploaded walkthrough binding could not be confirmed. Check its saved status before continuing.', 'INVALID_RESPONSE', 200)
  return result
}
export async function checkNativeCaptureAddress(id: string, address: string, actorId: string) {
  z.string().uuid().parse(id)
  const body = checkCaptureAddressInputSchema.parse({ address })
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, captureAddressKey(body.address))
  const result = memberResponse(captureAddressResultSchema, await api<unknown>(`/captures/${id}/check-address?details=1`, { method: 'POST', body, expectedUserId: actorId }))
  if (result.captureId !== id || result.addressHash !== hash) throw new ApiError('This address result does not match the current recording and address. Check it again.', 'INVALID_RESPONSE', 200)
  return result
}

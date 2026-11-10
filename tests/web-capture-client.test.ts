import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { browserCaptureReading, listingRequest, sealBrowserCapture } from '@/lib/listings/capture-client'
import { useRentralStore } from '@/store/useRentralStore'

const actor = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222'
const now = Date.parse('2030-01-01T10:00:00.000Z'), path = `${actor}/video.mp4`
const dto = (status: 'sealed' | 'recorded' | 'expired', videoPath: string | null = null) => ({ id, status, startedAt: new Date(now).toISOString(), finishBy: new Date(now + 180000).toISOString(),
  finishedAt: new Date(now + 10000).toISOString(), sealBy: new Date(now + 86400000).toISOString(), videoPath, listingId: null })
const response = (data: unknown) => Response.json({ success: true, data })
afterEach(() => { vi.unstubAllGlobals(); useRentralStore.getState().reset() })

function position(age = 0, accuracy = 10) {
  return { timestamp: now - age, coords: { latitude: 6.5, longitude: 3.4, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, toJSON: () => ({}) } satisfies GeolocationPosition
}
it('preserves the actual GPS sample timestamp and rejects cached or inaccurate browser readings', () => {
  expect(browserCaptureReading(position(1000), now)).toEqual({ latitude: 6.5, longitude: 3.4, accuracy: 10, capturedAt: new Date(now - 1000).toISOString() })
  expect(() => browserCaptureReading(position(15001), now)).toThrow()
  expect(() => browserCaptureReading(position(-15001), now)).toThrow()
  for (const accuracy of [0, -1, 101, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => browserCaptureReading(position(0, accuracy), now)).toThrow()
})
it('keeps the captured actor restriction and never replays a lost POST acknowledgment', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost acknowledgment'))
  vi.stubGlobal('fetch', fetch)
  await expect(listingRequest(actor, '/api/v1/captures', z.object({}), { id })).rejects.toMatchObject({ status: 0 })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', headers: { 'X-Rentral-Account': actor, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
})
it('does no request without an authenticated actor and surfaces a changed-account refusal', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ success: false, error: 'Reload after account change.', code: 'ACCOUNT_CHANGED' }, { status: 409 }))
  vi.stubGlobal('fetch', fetch)
  await expect(listingRequest('', '/api/v1/captures', z.object({}), {})).rejects.toMatchObject({ status: 401 })
  expect(fetch).not.toHaveBeenCalled()
  await expect(listingRequest(actor, '/api/v1/captures', z.object({}), {})).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('recovers an acknowledged seal through readback without another POST', async () => {
  const fetch = vi.fn().mockResolvedValue(response(dto('sealed', path))); vi.stubGlobal('fetch', fetch)
  await sealBrowserCapture(actor, id, path)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1].method).toBe('GET')
})
it('rejects a different sealed video and expired captures before any write', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(dto('sealed', `${actor}/other.mp4`))).mockResolvedValueOnce(response(dto('expired')))
  vi.stubGlobal('fetch', fetch)
  await expect(sealBrowserCapture(actor, id, path)).rejects.toMatchObject({ code: 'CAPTURE_VIDEO_CHANGED' })
  await expect(sealBrowserCapture(actor, id, path)).rejects.toMatchObject({ code: 'CAPTURE_INCOMPLETE' })
  expect(fetch.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true)
})
it('seals recorded footage once, binding the exact uploaded path', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(dto('recorded'))).mockResolvedValueOnce(response(dto('sealed', path)))
  vi.stubGlobal('fetch', fetch)
  await sealBrowserCapture(actor, id, path)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ videoPath: path }) })
})
it('never treats a malformed successful response as a confirmed recording', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ id, status: 'sealed' })); vi.stubGlobal('fetch', fetch)
  await expect(sealBrowserCapture(actor, id, path)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('retakes discard the previous capture and uploaded paths, while retaining the typed address', () => {
  const store = useRentralStore.getState()
  store.setCaptureId(id); store.setAddress('Fixture address'); store.rememberUploadedMedia({ videoPath: path, posterPath: null, documentPath: `${actor}/proof.pdf` })
  store.resetCapture()
  expect(useRentralStore.getState()).toMatchObject({ captureId: null, remoteVideoPath: null, address: 'Fixture address', remoteDocumentPath: `${actor}/proof.pdf` })
})
it('clears another account’s unsaved private recording and form before entering its wizard', () => {
  const store = useRentralStore.getState()
  store.setActorId(actor); store.setCaptureId(id); store.setAddress('Private draft for first account')
  store.setActorId(id)
  expect(useRentralStore.getState()).toMatchObject({ actorId: id, captureId: null, address: '', videoBlob: null, remoteVideoPath: null })
})

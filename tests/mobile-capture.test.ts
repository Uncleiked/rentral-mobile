import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
const fixture = vi.hoisted(() => ({ fetch: vi.fn(), session: vi.fn(), invalidate: vi.fn() }))
vi.mock('expo-crypto', async () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_algorithm: string, value: string) => (await import('node:crypto')).createHash('sha256').update(value).digest('hex') }))
vi.mock('../apps/mobile/src/lib/auth', () => ({ getSession: fixture.session, invalidateSession: fixture.invalidate }))
vi.mock('../apps/mobile/src/lib/config', () => ({ config: { apiUrl: 'http://192.168.0.1:3000' }, configurationError: null }))
import { beginNativeCapture, checkNativeCaptureAddress, finishNativeCapture, readNativeCapture, sealNativeCapture } from '../apps/mobile/src/lib/capture-api'
import { captureAddressKey, nativeCaptureReading } from '../apps/mobile/src/lib/native-capture-policy'
import { draftCaptureId, isLegacyDraftCommand, nativeAddressCheckMatches, recoveredCaptureSession } from '../apps/mobile/src/lib/native-draft-workflow'
import { readOwnerListingRequest, saveOwnerListing } from '../apps/mobile/src/lib/owner-listing-api'
import { EMPTY_LISTING_FORM } from '../apps/mobile/src/lib/native-listing'
import type { NativeDeviceDraft } from '../apps/mobile/src/lib/native-draft-store'
import type { CaptureStatus } from '../lib/contracts/capture'
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333', listingId = '44444444-4444-4444-8444-444444444444'
const now = Date.parse('2030-01-01T10:00:00.000Z')
const reading = { latitude: 6.5, longitude: 3.4, accuracy: 10, capturedAt: new Date(now).toISOString() }
const started: CaptureStatus = { id, status: 'recording', startedAt: new Date(now).toISOString(), finishBy: new Date(now + 180000).toISOString(), finishedAt: null, sealBy: null, videoPath: null, listingId: null }
const recorded: CaptureStatus = { ...started, status: 'recorded', finishedAt: new Date(now + 20000).toISOString(), sealBy: new Date(now + 7 * 86400000).toISOString() }
const path = `${actor}/fixture/video.mp4`
const sealed: CaptureStatus = { ...recorded, status: 'sealed', videoPath: path }
function draft(): NativeDeviceDraft { return { version: 1, actorId: actor, localId: other, sequence: 1, category: 'house', form: { ...EMPTY_LISTING_FORM, address: '12 Fixture Street, Yaba, Lagos' }, capture: { uri: 'file:///video.mp4', captureId: id, duration: 20 }, captureSession: { id, phase: 'finishing', status: started, finishInput: { reading, durationSeconds: 20 }, sealPath: null }, document: null, videoUpload: null, documentUpload: null, server: null, pending: null, savedAt: new Date(now).toISOString() } }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', fixture.fetch); fixture.session.mockResolvedValue({ user: { id: actor }, access_token: 'fixture-access' }); fixture.invalidate.mockResolvedValue(undefined) })
afterEach(() => vi.unstubAllGlobals())
const respond = (data: unknown) => fixture.fetch.mockResolvedValueOnce(Response.json({ success: true, data }))
describe('native recording GPS policy', () => {
  it('allows only the precise location allowlist and records the actual GPS timestamp', () => {
    expect(nativeCaptureReading({ timestamp: now - 1000, mocked: false, coords: { latitude: 6.5, longitude: 3.4, accuracy: 10, altitude: 50 } } as Parameters<typeof nativeCaptureReading>[0], now)).toEqual({ ...reading, mocked: false, capturedAt: new Date(now - 1000).toISOString() })
  })
  it.each([{ timestamp: now - 15001 }, { timestamp: now + 5001 }, { timestamp: NaN }, { mocked: true }, { coords: { latitude: 91, longitude: 3.4, accuracy: 10 } }, { coords: { latitude: 6.5, longitude: 3.4, accuracy: 0 } }, { coords: { latitude: 6.5, longitude: 3.4, accuracy: 101 } }, { coords: { latitude: 6.5, longitude: 3.4, accuracy: null } }])('rejects unusable recording evidence %j', patch => {
    expect(() => nativeCaptureReading({ timestamp: now, coords: { latitude: 6.5, longitude: 3.4, accuracy: 10 }, ...patch }, now)).toThrow('fresh, precise GPS')
  })
})
describe('native capture transport and recovery', () => {
  it('uses the exact actor and capture id for each protocol stage, with GPS only in begin/finish', async () => {
    respond(started); respond(recorded); respond(sealed); respond(sealed)
    await beginNativeCapture(id, reading, actor); await finishNativeCapture(id, { reading, durationSeconds: 20 }, actor); await sealNativeCapture(id, path, actor); await readNativeCapture(id, actor)
    expect(fixture.fetch).toHaveBeenCalledTimes(4)
    const calls = fixture.fetch.mock.calls
    expect(calls.map(([url]) => url)).toEqual([`http://192.168.0.1:3000/api/v1/captures`, `http://192.168.0.1:3000/api/v1/captures/${id}/finish`, `http://192.168.0.1:3000/api/v1/captures/${id}/seal`, `http://192.168.0.1:3000/api/v1/captures/${id}`])
    for (const [, options] of calls) expect(options.headers).toMatchObject({ 'X-Rentral-Account': actor })
    expect(JSON.parse(calls[0][1].body)).toEqual({ id, reading })
    expect(JSON.parse(calls[2][1].body)).toEqual({ videoPath: path }); expect(calls[3][1].body).toBeUndefined()
  })
  it('never retries a dropped begin/finish/seal response automatically', async () => {
    fixture.fetch.mockRejectedValue(new TypeError('connection lost'))
    for (const action of [() => beginNativeCapture(id, reading, actor), () => finishNativeCapture(id, { reading, durationSeconds: 20 }, actor), () => sealNativeCapture(id, path, actor)]) await expect(action()).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fixture.fetch).toHaveBeenCalledTimes(3)
  })
  it('rejects a changed actor before any protocol request is sent', async () => {
    fixture.session.mockResolvedValue({ user: { id: other }, access_token: 'different' })
    await expect(beginNativeCapture(id, reading, actor)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' }); expect(fixture.fetch).not.toHaveBeenCalled()
  })
  it('rejects substituted ids, stale begin stages and a different sealed video acknowledgment', async () => {
    respond({ ...started, id: other }); respond(recorded); respond({ ...sealed, videoPath: 'another/video.mp4' })
    await expect(beginNativeCapture(id, reading, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(beginNativeCapture(id, reading, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(sealNativeCapture(id, path, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('keeps contradictory readback stages unconfirmed instead of claiming the location is sealed', async () => {
    respond({ ...sealed, finishedAt: null }); respond({ ...started, finishBy: started.startedAt })
    await expect(readNativeCapture(id, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    await expect(readNativeCapture(id, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('recovers an acknowledged finish without replaying it and requires a new take for an unfinished camera session', () => {
    expect(recoveredCaptureSession(draft(), recorded)).toMatchObject({ phase: 'recorded', finishInput: null })
    expect(recoveredCaptureSession(draft(), started)).toMatchObject({ phase: 'interrupted', finishInput: null })
    expect(recoveredCaptureSession(draft(), { ...started, status: 'expired' })).toMatchObject({ phase: 'expired' })
    expect(fixture.fetch).not.toHaveBeenCalled()
  })
  it('recovers only the exact sealed path and refuses an already attached different listing', () => {
    const current = draft(); current.captureSession = { ...current.captureSession!, phase: 'sealing', sealPath: path }
    expect(recoveredCaptureSession(current, sealed)).toMatchObject({ phase: 'sealed', sealPath: path })
    expect(() => recoveredCaptureSession(current, { ...sealed, videoPath: 'different/video.mp4' })).toThrow('different uploaded walkthrough')
    expect(() => recoveredCaptureSession(current, { ...sealed, listingId })).toThrow('already attached')
  })
  it('uses a read-only receipt for a legacy pending request and never sends its old coordinates again', async () => {
    const command = { mode: 'submit' as const, listing: { clientId: other, category: 'house' as const, address: 'Fixture address', basePrice: '1', metadata: {}, videoPath: path, documentPath: `${actor}/proof.pdf`, lat: 6.5, lng: 3.4 } }
    expect(isLegacyDraftCommand(command)).toBe(true)
    await expect(saveOwnerListing(command, actor)).rejects.toThrow('earlier recording format'); expect(fixture.fetch).not.toHaveBeenCalled()
    respond({ id: listingId, status: 'draft' }); await readOwnerListingRequest(other, 'submit', actor)
    expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith(`http://192.168.0.1:3000/api/v1/my-listings/requests/${other}?mode=submit`, expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-Rentral-Account': actor }) }))
  })
})
describe('address preflight identity', () => {
  it('opts into bounded lookup reasons while remaining compatible with an older backend response', async () => {
    const address = '12 Fixture Street, Yaba, Lagos', addressHash = createHash('sha256').update(captureAddressKey(address)).digest('hex')
    respond({ captureId: id, status: 'unavailable', addressHash, toleranceMeters: 100, reason: 'imprecise' })
    expect(await checkNativeCaptureAddress(id, address, actor)).toMatchObject({ status: 'unavailable', reason: 'imprecise' })
    expect(fixture.fetch).toHaveBeenCalledWith(`http://192.168.0.1:3000/api/v1/captures/${id}/check-address?details=1`, expect.objectContaining({ body: JSON.stringify({ address }), headers: expect.objectContaining({ 'X-Rentral-Account': actor }) }))
    respond({ captureId: id, status: 'unavailable', addressHash, toleranceMeters: 100 })
    expect(await checkNativeCaptureAddress(id, address, actor)).toMatchObject({ status: 'unavailable' })
    respond({ captureId: id, status: 'unavailable', addressHash, toleranceMeters: 100, reason: 'private arbitrary provider error' })
    await expect(checkNativeCaptureAddress(id, address, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('accepts only the exact normalized address fingerprint and captured recording in the response', async () => {
    const address = '  12 Fixture Street,   Yaba, Lagos  ', addressHash = createHash('sha256').update(captureAddressKey(address)).digest('hex')
    respond({ captureId: id, status: 'matched', addressHash, toleranceMeters: 100 }); expect((await checkNativeCaptureAddress(id, address, actor)).status).toBe('matched')
    respond({ captureId: id, status: 'matched', addressHash: 'a'.repeat(64), toleranceMeters: 100 }); await expect(checkNativeCaptureAddress(id, address, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    respond({ captureId: other, status: 'matched', addressHash, toleranceMeters: 100 }); await expect(checkNativeCaptureAddress(id, address, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('invalidates a match after changing address or recording and never treats mismatch/unavailable as permission', () => {
    const current = draft(), check = { captureId: id, addressKey: captureAddressKey(current.form.address), status: 'matched' as const }
    expect(nativeAddressCheckMatches(current, check)).toBe(true)
    expect(nativeAddressCheckMatches({ ...current, form: { ...current.form, address: 'Different building, Abuja' } }, check)).toBe(false)
    expect(nativeAddressCheckMatches({ ...current, capture: { ...current.capture!, captureId: other } }, check)).toBe(false)
    for (const status of ['mismatch','unavailable'] as const) expect(nativeAddressCheckMatches(current, { ...check, status })).toBe(false)
    expect(draftCaptureId({ ...current, capture: { uri: 'file:///legacy.mp4', duration: 20, lat: 6.5, lng: 3.4, accuracy: 10 } })).toBeNull()
  })
})

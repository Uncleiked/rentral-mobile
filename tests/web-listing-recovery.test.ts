import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRentralStore, isWizardCurrent } from '@/store/useRentralStore'
import { captureRecoveryKey, commandRecoveryKey, normalizeWebListingCommand, readWebListingCommand } from '@/lib/listings/wizard-recovery'
import { assertWizardCurrent, executeWebListingCommand, listingRequest } from '@/lib/listings/capture-client'
import { listingMutationResultSchema } from '@/lib/contracts/listings'

const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', nonce = '33333333-3333-4333-8333-333333333333', captureId = '44444444-4444-4444-8444-444444444444', listingId = '55555555-5555-4555-8555-555555555555'
let values: Map<string, string>, failWrites: boolean
const metadata = { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' }
const partial = () => ({ mode: 'draft' as const, listing: { clientId: nonce, category: 'house' as const, wizardStep: 'details' as const, address: '12 Fixture Street, Yaba, Lagos', basePrice: '500000', metadata } })
const submitted = () => ({ mode: 'submit' as const, listing: { ...partial().listing, wizardStep: undefined, captureId, videoPath: `${actor}/fixture/video.mp4`, documentPath: `${actor}/fixture/proof.pdf` } })
function submitCommand() { const { wizardStep: _step, ...listing } = submitted().listing; void _step; return { mode: 'submit' as const, listing } }
const identity = () => ({ actorId: actor, generation: useRentralStore.getState().generation })
const response = (data: unknown) => Response.json({ success: true, data })
const date = '2030-01-01T10:00:00.000Z'
const dto = (status: 'recorded' | 'sealed') => ({ id: captureId, status, startedAt: date, finishBy: '2030-01-01T10:03:00.000Z', finishedAt: '2030-01-01T10:00:20.000Z', sealBy: '2030-01-08T10:00:20.000Z', videoPath: status === 'sealed' ? `${actor}/fixture/video.mp4` : null, listingId: null })
beforeEach(() => {
  values = new Map(); failWrites = false
  const storage: Storage = { get length() { return values.size }, clear() { values.clear() }, key(index) { return [...values.keys()][index] ?? null }, getItem(key) { return values.get(key) ?? null }, setItem(key, value) { if (failWrites) throw new Error('Storage denied'); values.set(key, value) }, removeItem(key) { values.delete(key) } }
  vi.stubGlobal('window', { sessionStorage: storage })
  useRentralStore.getState().setActorId(other); useRentralStore.getState().setActorId(actor); useRentralStore.getState().reset()
})
afterEach(() => { values.clear(); useRentralStore.getState().setActorId(other); useRentralStore.getState().reset(); vi.unstubAllGlobals() })
it('persists the original normalized command before the first request and never stores old GPS/private metadata', async () => {
  const input = partial(); input.listing.metadata = { ...metadata, hardware_coordinates: [3.4, 6.5], access_token: 'not-allowed' } as typeof metadata
  const command = useRentralStore.getState().prepareListingCommand(input)
  const fetch = vi.fn().mockImplementation(async () => { expect(readWebListingCommand(actor)).toEqual(command); return response({ id: listingId, status: 'draft' }) })
  vi.stubGlobal('fetch', fetch)
  await executeWebListingCommand(identity(), command)
  expect(fetch).toHaveBeenCalledTimes(1); expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(command)
  expect(values.get(commandRecoveryKey(actor))).not.toMatch(/hardware_coordinates|access_token|latitude|longitude/)
})
it('does not send anything when browser recovery cannot be saved', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); failWrites = true
  expect(() => useRentralStore.getState().prepareListingCommand(partial())).toThrow('Storage denied')
  expect(useRentralStore.getState().pendingCommand).toBeNull(); expect(fetch).not.toHaveBeenCalled()
})
it('blocks other mutations and step navigation until the exact saved command is resolved', () => {
  const store = useRentralStore.getState(); store.setStep('checkout'); const command = store.prepareListingCommand(partial())
  store.goBack(); store.goNext(); store.reset(); store.resetCapture()
  expect(useRentralStore.getState()).toMatchObject({ step: 'checkout', pendingCommand: command })
  expect(() => store.prepareListingCommand({ ...partial(), listing: { ...partial().listing, clientId: other } })).toThrow('Confirm the saved')
  store.completeListingCommand(nonce); store.goBack(); expect(useRentralStore.getState().step).toBe('documents')
})
it('restores the full exact command after a process reload and requires fresh readback before retry', () => {
  const command = useRentralStore.getState().prepareListingCommand(partial())
  useRentralStore.setState({ pendingCommand: null, pendingAttempted: false, address: '', category: null })
  useRentralStore.getState().restoreRecovery()
  expect(useRentralStore.getState()).toMatchObject({ pendingCommand: command, pendingChecked: false, pendingAttempted: true, category: 'house', address: command.listing.address })
  expect(() => useRentralStore.getState().claimListingCommand(nonce)).toThrow('Check the original')
})
it('does not replay a lost acknowledgment; explicit404 readback permits only the original nonce and body', async () => {
  const command = useRentralStore.getState().prepareListingCommand(partial())
  const fetch = vi.fn().mockRejectedValueOnce(new Error('lost acknowledgment')).mockResolvedValueOnce(Response.json({ success: false, error: 'Not found', code: 'REQUEST_NOT_FOUND' }, { status: 404 })).mockResolvedValueOnce(response({ id: listingId, status: 'draft' }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeWebListingCommand(identity(), command)).rejects.toMatchObject({ status: 0 })
  await expect(executeWebListingCommand(identity(), command)).rejects.toThrow('Check the original'); expect(fetch).toHaveBeenCalledTimes(1)
  await expect(listingRequest(actor, `/api/v1/my-listings/requests/${nonce}?mode=draft`, listingMutationResultSchema)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' })
  useRentralStore.getState().markPendingChecked(nonce)
  await executeWebListingCommand(identity(), command, true)
  expect(fetch).toHaveBeenCalledTimes(3); expect(fetch.mock.calls[2][1].body).toBe(fetch.mock.calls[0][1].body)
})
it('keeps an uncertain seal and full listing command recoverable, then reads an accepted seal without repeating it', async () => {
  const command = useRentralStore.getState().prepareListingCommand(submitCommand())
  const fetch = vi.fn().mockResolvedValueOnce(response(dto('recorded'))).mockRejectedValueOnce(new Error('seal acknowledgment lost')).mockResolvedValueOnce(response(dto('sealed'))).mockResolvedValueOnce(response({ id: listingId, status: 'pending_verification' }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeWebListingCommand(identity(), command)).rejects.toMatchObject({ status: 0 })
  expect(readWebListingCommand(actor)).toEqual(command)
  useRentralStore.getState().markPendingChecked(nonce)
  await executeWebListingCommand(identity(), command, true)
  expect(fetch.mock.calls.map(([url, init]) => [url, init.method])).toEqual([[`/api/v1/captures/${captureId}`, 'GET'], [`/api/v1/captures/${captureId}/seal`, 'POST'], [`/api/v1/captures/${captureId}`, 'GET'], ['/api/v1/my-listings', 'POST']])
})
it('stops a late seal read from posting after the account or wizard generation changes', async () => {
  const command = useRentralStore.getState().prepareListingCommand(submitCommand()), original = identity()
  let release!: (value: Response) => void
  const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve }))
  vi.stubGlobal('fetch', fetch)
  const work = executeWebListingCommand(original, command)
  useRentralStore.getState().setActorId(other); useRentralStore.getState().setAddress('Another account’s new work')
  release(response(dto('recorded')))
  await expect(work).rejects.toMatchObject({ code: 'WIZARD_CHANGED' }); expect(fetch).toHaveBeenCalledTimes(1)
  expect(useRentralStore.getState().address).toBe('Another account’s new work'); expect(readWebListingCommand(actor)).toEqual(command)
  expect(isWizardCurrent(actor, original.generation)).toBe(false)
})
it('rejects a stale same-account generation and inactive component before any global mutation or HTTP', async () => {
  const command = useRentralStore.getState().prepareListingCommand(partial()), original = identity(), fetch = vi.fn()
  vi.stubGlobal('fetch', fetch); useRentralStore.getState().advanceGeneration()
  await expect(executeWebListingCommand(original, command)).rejects.toMatchObject({ code: 'WIZARD_CHANGED' })
  expect(() => assertWizardCurrent({ ...identity(), isActive: () => false })).toThrow('listing session changed')
  expect(fetch).not.toHaveBeenCalled(); expect(readWebListingCommand(actor)).toEqual(command)
})
it('does not clear an older unknown request after a rejected retry, but initial definite validation can return to editing', async () => {
  const command = useRentralStore.getState().prepareListingCommand(partial())
  const fetch = vi.fn().mockImplementation(async () => Response.json({ success: false, error: 'Address mismatch', code: 'ADDRESS_MISMATCH' }, { status: 409 }))
  vi.stubGlobal('fetch', fetch)
  await expect(executeWebListingCommand(identity(), command)).rejects.toMatchObject({ code: 'ADDRESS_MISMATCH' }); expect(readWebListingCommand(actor)).toBeNull()
  useRentralStore.getState().prepareListingCommand(partial()); useRentralStore.getState().claimListingCommand(nonce); useRentralStore.getState().markPendingChecked(nonce)
  await expect(executeWebListingCommand(identity(), command, true)).rejects.toMatchObject({ code: 'ADDRESS_MISMATCH' }); expect(readWebListingCommand(actor)).toEqual(command)
})
it('keeps a malformed error response uncertain instead of erasing its original recovery marker', async () => {
  const command = useRentralStore.getState().prepareListingCommand(partial())
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Gateway interrupted</html>', { status: 409 })))
  await expect(executeWebListingCommand(identity(), command)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(readWebListingCommand(actor)).toEqual(command)
})
it('does not clear or reset recovery from a late refusal after its component unmounts', async () => {
  const command = useRentralStore.getState().prepareListingCommand(partial())
  let active = true, release!: (value: Response) => void
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve })))
  const work = executeWebListingCommand({ ...identity(), isActive: () => active }, command)
  active = false; release(Response.json({ success: false, error: 'Declined', code: 'ADDRESS_MISMATCH' }, { status: 409 }))
  await expect(work).rejects.toMatchObject({ code: 'ADDRESS_MISMATCH' }); expect(readWebListingCommand(actor)).toEqual(command)
})
it('keeps a pending camera finish id/blob across navigation and stores only its small recovery marker on disk', () => {
  const blob = new Blob(['fixture video']), store = useRentralStore.getState()
  store.setStep('capture'); store.setCaptureId(captureId); store.setCapturePending({ id: captureId, phase: 'finish', blob, mime: 'video/mp4' })
  store.goBack(); store.resetCapture()
  expect(useRentralStore.getState().capturePending?.blob).toBe(blob)
  expect(JSON.parse(values.get(captureRecoveryKey(actor))!)).toEqual({ version: 1, actorId: actor, id: captureId, phase: 'finish' })
  useRentralStore.setState({ capturePending: null }); store.restoreRecovery()
  expect(useRentralStore.getState().capturePending).toEqual({ id: captureId, phase: 'finish' })
  store.clearCapturePending(); expect(values.has(captureRecoveryKey(actor))).toBe(false)
})
it('preserves another account’s markers and refuses corrupted recovery instead of silently discarding it', () => {
  const command = useRentralStore.getState().prepareListingCommand(partial())
  useRentralStore.getState().setActorId(other); expect(readWebListingCommand(actor)).toEqual(command)
  values.set(commandRecoveryKey(other), '{broken json'); useRentralStore.getState().restoreRecovery()
  expect(useRentralStore.getState().recoveryError).toMatch(/cannot be read/)
  expect(() => useRentralStore.getState().prepareListingCommand(partial())).toThrow('Confirm the saved')
})
it('captures current typed draft values and strips unknown legacy fields without changing the requested nonce', () => {
  const store = useRentralStore.getState(); store.setCategory('house'); store.setAddress('Newly typed current address'); store.setBasePrice('900000'); store.updateHouseMetadata({ bedrooms: '4', listingTitle: 'Current unsaved title' })
  const current = useRentralStore.getState(), command = normalizeWebListingCommand({ mode: 'draft', listing: { clientId: nonce, category: 'house', wizardStep: 'details', address: current.address, basePrice: current.basePrice, metadata: current.metadata.house } })
  expect(command.listing).toMatchObject({ clientId: nonce, address: 'Newly typed current address', basePrice: '900000', metadata: { bedrooms: '4', listingTitle: 'Current unsaved title' } })
})

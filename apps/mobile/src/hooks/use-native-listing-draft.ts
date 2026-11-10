import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { ownerListingDetailSchema } from '../../../../lib/contracts/listings'
import type { CaptureReading } from '../../../../lib/contracts/capture'
import { useAuth } from '../providers/AuthProvider'
import { ApiError, errorMessage } from '../lib/api'
import { memberGet } from '../lib/member-api'
import { listingFormError, type ListingCategory, type ListingForm, type NativeCapture } from '../lib/native-listing'
import { confirmOwnedUpload, readOwnerListingRequest, saveOwnerListing } from '../lib/owner-listing-api'
import { prepareNativeListingUpload, uploadPreparedNativeListingFile } from '../lib/native-upload'
import { buildNativeDraftCommand, canClearDeclinedDraft, draftCaptureId, isLegacyDraftCommand, nativeAddressCheckMatches, recoveredCaptureSession, type NativeAddressCheck } from '../lib/native-draft-workflow'
import { beginNativeCapture, captureAddressKey, checkNativeCaptureAddress, finishNativeCapture, readNativeCapture, sealNativeCapture } from '../lib/capture-api'
import { dismissNativeDeviceDraft, loadNativeDeviceDraft, newNativeDeviceDraft, resolveNativeDeviceDraft, saveNativeDeviceDraft, serverDraftState, stashNativeDraftFile, type NativeDeviceDraft } from '../lib/native-draft-store'
import { formFromOwnerListing } from '../lib/native-listing'

export function useNativeListingDraft(serverId: string | null) {
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const currentActor = useRef(actorId)
  useLayoutEffect(() => { currentActor.current = actorId; return () => { currentActor.current = '' } }, [actorId])
  const [draft, setDraft] = useState<NativeDeviceDraft | null>(null)
  const latest = useRef<NativeDeviceDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [deviceSavedAt, setDeviceSavedAt] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [addressCheck, setAddressCheck] = useState<NativeAddressCheck | null>(null)
  const latestAddressCheck = useRef<NativeAddressCheck | null>(null)
  const [generation, setGeneration] = useState(0)
  const lock = useRef(false)
  const mounted = useRef(false)
  const restoring = useRef(0)
  const formTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uploadController = useRef<AbortController | null>(null)
  const commit = useCallback(async (next: NativeDeviceDraft): Promise<NativeDeviceDraft> => {
    if (currentActor.current !== next.actorId) throw new ApiError('Your account changed. Reopen the listing draft before continuing.', 'ACCOUNT_CHANGED', 409)
    if (formTimer.current) { clearTimeout(formTimer.current); formTimer.current = null }
    latest.current = next; setDraft(next)
    const saved = await saveNativeDeviceDraft(next)
    if (currentActor.current === saved.actorId && mounted.current && latest.current?.localId === saved.localId && latest.current.sequence <= saved.sequence) { latest.current = saved; setDraft(saved); setDeviceSavedAt(saved.savedAt) }
    return saved
  }, [])
  useFocusEffect(useCallback(() => {
    if (!actorId) return
    mounted.current = true
    restoring.current = generation
    const restoreAttempt = generation
    let active = true
    if (!latest.current || latest.current.actorId !== actorId) {
      setLoading(true); setError(null)
      latestAddressCheck.current = null; setAddressCheck(null)
      void (async () => {
        const local = await loadNativeDeviceDraft(actorId)
        if (!active || restoring.current !== restoreAttempt) return
        if (local) { latest.current = local; setDraft(local); setDeviceSavedAt(local.savedAt); return }
        const server = serverId ? await memberGet(`/my-listings/${serverId}`, ownerListingDetailSchema, undefined, actorId) : undefined
        if (server && (!server.actions.resume || server.archivedAt)) throw new Error('This listing is no longer an editable draft. Open it from My listings.')
        const initial = newNativeDeviceDraft(actorId, server)
        if (!active || restoring.current !== restoreAttempt) return
        await commit(initial)
      })().catch(failure => { if (active) setError(errorMessage(failure)) }).finally(() => { if (active) setLoading(false) })
    }
    const flush = (): void => {
      if (!formTimer.current || !latest.current) return
      clearTimeout(formTimer.current); formTimer.current = null
      void saveNativeDeviceDraft(latest.current).catch(() => undefined)
    }
    const appListener = AppState.addEventListener('change', state => { if (state !== 'active') flush() })
    return () => { active = false; mounted.current = false; flush(); appListener.remove() }
  }, [actorId, serverId, commit, generation]))
  function snapshot(patch: Partial<NativeDeviceDraft>): NativeDeviceDraft {
    if (!latest.current || latest.current.actorId !== actorId || currentActor.current !== actorId) throw new ApiError('Open your current account’s device draft before changing it.', 'ACCOUNT_CHANGED', 409)
    return { ...latest.current, ...patch, sequence: latest.current.sequence + 1, savedAt: new Date().toISOString() }
  }
  function updateForm(category: ListingCategory, form: ListingForm): void {
    if (lock.current || latest.current?.pending) return
    setMessage(null)
    if (latest.current?.category !== category || captureAddressKey(latest.current.form.address) !== captureAddressKey(form.address)) { latestAddressCheck.current = null; setAddressCheck(null) }
    const next = snapshot({ category, form })
    latest.current = next; setDraft(next)
    if (formTimer.current) clearTimeout(formTimer.current)
    formTimer.current = setTimeout(() => {
      formTimer.current = null
      void commit(next).catch(failure => { if (mounted.current) setError(`Device recovery could not be saved: ${errorMessage(failure)}. No server save is confirmed.`) })
    }, 500)
  }
  async function capture(value: NativeCapture | null): Promise<void> {
    if (lock.current || !latest.current || latest.current.pending) throw new Error('Wait for the saved draft operation before replacing this recording.')
    if (value) throw new Error('Record a fresh walkthrough with an online location session.')
    if (latest.current.captureSession && ['starting','recording','finishing','sealing'].includes(latest.current.captureSession.phase)) throw new Error('Check the saved recording status before replacing it.')
    lock.current = true; setBusy(true); setError(null); setPhase('Keeping your recording on this device…')
    try {
      const current = latest.current
      latestAddressCheck.current = null; setAddressCheck(null)
      await commit(snapshot({ capture: null, captureSession: null, videoUpload: null,
        server: current.server ? { ...current.server, videoPath: null, posterPath: null, captureId: null, hasCoords: false } : null }))
    } catch (failure) { setError(errorMessage(failure)); throw failure }
    finally { lock.current = false; setBusy(false); setPhase('') }
  }
  async function beginCapture(reading: CaptureReading): Promise<string> {
    if (lock.current || !latest.current || latest.current.pending) throw new Error('Open the editable device draft before recording.')
    if (latest.current.captureSession && ['starting','recording','finishing','sealing'].includes(latest.current.captureSession.phase)) throw new Error('Check the saved recording status before starting another take.')
    lock.current = true; setBusy(true); setError(null)
    try {
      const id = Crypto.randomUUID()
      latestAddressCheck.current = null; setAddressCheck(null)
      await commit(snapshot({ capture: null, videoUpload: null, captureSession: { id, phase: 'starting', status: null, finishInput: null, sealPath: null } }))
      const status = await beginNativeCapture(id, reading, actorId)
      if (!mounted.current || currentActor.current !== actorId || latest.current?.captureSession?.id !== id || AppState.currentState !== 'active') throw new Error('Recording was interrupted before the camera started. Check the saved recording status and start a fresh take.')
      await commit(snapshot({ captureSession: { id, phase: 'recording', status, finishInput: null, sealPath: null } }))
      return id
    } catch (failure) { setError(errorMessage(failure)); throw failure }
    finally { lock.current = false; setBusy(false) }
  }
  async function completeCapture(value: NativeCapture, reading: CaptureReading): Promise<void> {
    if (lock.current || !latest.current || !value.captureId || latest.current.captureSession?.id !== value.captureId || latest.current.captureSession.phase !== 'recording') throw new Error('This recording no longer matches the active location session. Check its saved status.')
    lock.current = true; setBusy(true); setError(null); setPhase('Keeping your recording and confirming its end location…')
    try {
      const uri = await stashNativeDraftFile(actorId, latest.current.localId, value.uri, 'video')
      const finishInput = { reading, durationSeconds: value.duration }
      const savedSession = { ...latest.current.captureSession!, phase: 'finishing' as const, finishInput }
      await commit(snapshot({ capture: { uri, duration: value.duration, captureId: value.captureId }, videoUpload: null, captureSession: savedSession }))
      const status = await finishNativeCapture(value.captureId, finishInput, actorId)
      await commit(snapshot({ captureSession: { ...savedSession, phase: 'recorded', status, finishInput: null } }))
      setMessage('The recording and its start/end location are confirmed. Check the listing address before submitting.')
    } catch (failure) { setError(errorMessage(failure)); throw failure }
    finally { lock.current = false; setBusy(false); setPhase('') }
  }
  async function interruptCapture(id: string): Promise<void> {
    const current = latest.current?.captureSession
    if (!current || current.id !== id || !['starting','recording'].includes(current.phase)) return
    await commit(snapshot({ captureSession: { ...current, phase: 'interrupted' } }))
    setMessage('The interrupted session is kept for recovery. Record a fresh walkthrough before submitting.')
  }
  function isCaptureSessionActive(id: string): boolean {
    return mounted.current && currentActor.current === actorId && latest.current?.actorId === actorId && latest.current.captureSession?.id === id && latest.current.captureSession.phase === 'recording'
  }
  async function checkCapture(): Promise<void> {
    if (lock.current || !latest.current?.captureSession) return
    lock.current = true; setBusy(true); setError(null); setPhase('Checking the saved recording status…')
    try {
      const current = latest.current
      const status = await readNativeCapture(current.captureSession!.id, actorId)
      const recovered = recoveredCaptureSession(current, status)
      await commit(snapshot({ captureSession: recovered }))
      setMessage(recovered.phase === 'sealed' ? 'The exact uploaded walkthrough and backend location binding are confirmed.' : recovered.phase === 'recorded' ? 'The completed recording location is confirmed. Its original video is ready to upload.' : 'This recording cannot resume. Keep your draft and record a fresh walkthrough.')
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404 && latest.current?.captureSession) await commit(snapshot({ captureSession: { ...latest.current.captureSession, phase: 'interrupted' } }))
      setError(errorMessage(failure))
    } finally { lock.current = false; setBusy(false); setPhase('') }
  }
  async function checkAddress(): Promise<void> {
    if (lock.current || !latest.current || latest.current.pending) return
    lock.current = true; setBusy(true); setError(null); setPhase('Checking the address against your recording location…')
    latestAddressCheck.current = null; setAddressCheck(null)
    try {
      const current = latest.current, id = draftCaptureId(current), addressKey = captureAddressKey(current.form.address)
      if (!id || (current.capture && !['recorded','sealed'].includes(current.captureSession?.phase ?? ''))) throw new Error('Confirm a completed recording location before checking the address.')
      const result = await checkNativeCaptureAddress(id, current.form.address, actorId)
      if (currentActor.current !== actorId || !latest.current || draftCaptureId(latest.current) !== id || captureAddressKey(latest.current.form.address) !== addressKey || latest.current.category !== current.category) throw new Error('The recording or address changed. Check the current address again.')
      const next = { captureId: id, addressKey, status: result.status }
      latestAddressCheck.current = next; setAddressCheck(next)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false); setPhase('') }
  }
  async function document(value: { uri: string; name: string; mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' }): Promise<void> {
    if (lock.current || !latest.current || latest.current.pending) return
    lock.current = true; setBusy(true); setError(null); setPhase('Keeping your private document on this device…')
    try { const uri = await stashNativeDraftFile(actorId, latest.current.localId, value.uri, 'document', value.mimeType); await commit(snapshot({ document: { ...value, uri }, documentUpload: null })) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false); setPhase('') }
  }
  async function uploadFile(kind: 'video' | 'document'): Promise<void> {
    const current = latest.current
    if (!current) throw new Error('Your device draft is unavailable.')
    const source = kind === 'video' ? current.capture : current.document
    if (!source) return
    const field = kind === 'video' ? 'videoUpload' : 'documentUpload'
    let prepared = current[field]
    if (prepared?.state === 'uploaded') return
    if (prepared?.state === 'unknown') throw new Error(`Check the saved ${kind === 'video' ? 'walkthrough' : 'document'} upload before saving again.`)
    if (!prepared) {
      prepared = { upload: prepareNativeListingUpload(source.uri, kind, actorId, kind === 'document' ? current.document!.mimeType : undefined), state: 'prepared' }
      await commit(snapshot({ [field]: prepared }))
    }
    setPhase(kind === 'video' ? 'Uploading the walkthrough…' : 'Uploading your private authority document…')
    // Mark unknown BEFORE sending. A crash at any later point requires readback.
    await commit(snapshot({ [field]: { ...prepared, state: 'unknown' } }))
    const controller = new AbortController()
    uploadController.current = controller; setUploading(true)
    try { await uploadPreparedNativeListingFile(prepared.upload, actorId, controller.signal); await commit(snapshot({ [field]: { ...prepared, state: 'uploaded' } })) }
    catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.code !== 'INVALID_RESPONSE' && failure.status !== 409) await commit(snapshot({ [field]: { ...prepared, state: 'prepared' } }))
      throw failure
    }
    finally { if (uploadController.current === controller) uploadController.current = null; setUploading(false) }
  }
  async function ensureSealed(): Promise<void> {
    const current = latest.current
    if (!current?.capture) return
    const captureSession = current.captureSession, upload = current.videoUpload
    if (!current.capture.captureId || !captureSession || captureSession.id !== current.capture.captureId) throw new Error('This earlier recording needs a fresh backend location lock. Keep your draft and record it again.')
    if (!upload || upload.state !== 'uploaded') throw new Error('Confirm the walkthrough upload before binding its location.')
    if (captureSession.phase === 'sealed' && captureSession.status?.videoPath === upload.upload.path) return
    if (captureSession.phase !== 'recorded') throw new Error('Check the saved recording status before saving this listing. An uncertain location request is never repeated automatically.')
    const sealing = { ...captureSession, phase: 'sealing' as const, sealPath: upload.upload.path }
    await commit(snapshot({ captureSession: sealing }))
    setPhase('Binding the uploaded walkthrough to its locked location…')
    const status = await sealNativeCapture(captureSession.id, upload.upload.path, actorId)
    await commit(snapshot({ captureSession: { ...sealing, phase: 'sealed', status } }))
  }
  async function send(mode: 'draft' | 'submit'): Promise<void> {
    if (lock.current || !latest.current || !actorId) return
    if (latest.current.pending && !checked) return
    const restoringSavedRequest = Boolean(latest.current.pending)
    lock.current = true; setBusy(true); setError(null); setMessage(null); setChecked(false)
    let saveAccepted = false
    try {
      if (!latest.current.pending) {
        if (latest.current.capture && (!latest.current.capture.captureId || !['recorded','sealed'].includes(latest.current.captureSession?.phase ?? ''))) throw new Error('Confirm the completed backend recording location, or record a fresh walkthrough before saving.')
        if (mode === 'submit') {
          const invalid = listingFormError(latest.current.category, latest.current.form); if (invalid) throw new Error(invalid)
          if (!nativeAddressCheckMatches(latest.current, latestAddressCheck.current)) throw new Error('Check that the address matches your recording location before submitting.')
        }
        await uploadFile('video'); await ensureSealed(); await uploadFile('document')
        const command = buildNativeDraftCommand(latest.current, mode, Crypto.randomUUID())
        const saved = await commit(snapshot({ pending: command }))
        if (saved.pending?.listing.clientId !== command.listing.clientId) throw new Error('This device draft changed on another screen. Reopen recovery before saving.')
      }
      const current = latest.current
      const command = current.pending!
      setPhase(command.mode === 'submit' ? 'Submitting for asset review…' : 'Saving your server draft…')
      const result = await saveOwnerListing(command, actorId)
      saveAccepted = true
      const server = await memberGet(`/my-listings/${result.id}`, ownerListingDetailSchema, undefined, actorId)
      if (server.id !== result.id) throw new ApiError('The saved listing could not be confirmed. Keep the original request for recovery.', 'INVALID_RESPONSE', 200)
      const next = { ...current, form: formFromOwnerListing(server), category: server.category, server: serverDraftState(server),
        ...(server.videoPath !== current.videoUpload?.upload.path ? { capture: null, captureSession: null, videoUpload: null } : {}),
        ...(server.documentPath !== current.documentUpload?.upload.path ? { document: null, documentUpload: null } : {}) }
      const resolved = await resolveNativeDeviceDraft(actorId, current.localId, command.listing.clientId!, next)
      latest.current = resolved; if (mounted.current) setDraft(resolved)
      setMessage(server.status === 'draft' ? 'Your draft is saved on the server. Its current details are shown and its recording is available in the private vault.' : 'Your listing is saved for review. Publication, provider processing and any fees remain separate.')
    } catch (failure) {
      const current = latest.current
      if (current?.pending && canClearDeclinedDraft(failure, restoringSavedRequest, saveAccepted)) {
        try { const resolved = await resolveNativeDeviceDraft(actorId, current.localId, current.pending.listing.clientId!, current); latest.current = resolved; if (mounted.current) setDraft(resolved) }
        catch { setError('The server declined this save, but device recovery could not be updated. Keep the saved request and check My listings.'); return }
      }
      setError(errorMessage(failure))
    }
    finally { lock.current = false; setBusy(false); setPhase('') }
  }
  async function checkUploads(): Promise<void> {
    if (lock.current || !latest.current) return
    lock.current = true; setBusy(true); setError(null)
    try {
      for (const field of ['videoUpload','documentUpload'] as const) {
        const item = latest.current[field]
        if (item?.state !== 'unknown') continue
        await confirmOwnedUpload(item.upload.bucket, item.upload.path, { size: item.upload.size, contentType: item.upload.contentType }, actorId)
        await commit(snapshot({ [field]: { ...item, state: 'uploaded' } }))
      }
      setMessage('The saved upload status is confirmed. No file was uploaded again.')
    } catch (failure) { setError(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function checkRequest(): Promise<void> {
    if (lock.current || !latest.current?.pending) return
    lock.current = true; setBusy(true); setError(null)
    try {
      const current = latest.current, command = current.pending!
      try {
        const result = await readOwnerListingRequest(command.listing.clientId!, command.mode, actorId)
        const server = await memberGet(`/my-listings/${result.id}`, ownerListingDetailSchema, undefined, actorId)
        const resolved = await resolveNativeDeviceDraft(actorId, current.localId, command.listing.clientId!, { ...current, category: server.category, form: formFromOwnerListing(server), server: serverDraftState(server), capture: null, captureSession: null, videoUpload: null, document: null, documentUpload: null })
        if (currentActor.current === actorId) { latest.current = resolved; setDraft(resolved); latestAddressCheck.current = null; setAddressCheck(null) }
        setMessage('The original saved request is confirmed. Current server details are shown; no request was repeated.')
      } catch (failure) {
        if (!(failure instanceof ApiError) || failure.status !== 404 || failure.code !== 'REQUEST_NOT_FOUND') throw failure
        if (isLegacyDraftCommand(command)) { setMessage('No saved receipt was found for this earlier recording request. Review My listings, then explicitly discard device recovery and record a fresh walkthrough. Its original request was not repeated.'); return }
        setChecked(true); setMessage('No committed result was found. You can explicitly retry the exact saved request; its identifier and original instructions are retained.')
      }
    } catch (failure) { setError(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function dismiss(): Promise<void> {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { const cleanupPending = await dismissNativeDeviceDraft(actorId); latest.current = null; setDraft(null); setDeviceSavedAt(null); setMessage(cleanupPending ? 'Device recovery is cleared. Some local file copies could not be removed. Server records remain available.' : 'Device recovery and local copies are cleared. Server listings and uploaded evidence remain available.'); setError(null) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function reloadServer(): Promise<void> {
    if (lock.current || !latest.current?.server || latest.current.pending) return
    lock.current = true; setBusy(true); setError(null)
    try {
      const server = await memberGet(`/my-listings/${latest.current.server.id}`, ownerListingDetailSchema, undefined, actorId)
      latestAddressCheck.current = null; setAddressCheck(null)
      await commit(snapshot({ category: server.category, form: formFromOwnerListing(server), server: serverDraftState(server), capture: null, captureSession: null, document: null, videoUpload: null, documentUpload: null }))
      setMessage('Current server details replace the device form. Exact capture coordinates remain private on the server.')
    } catch (failure) { setError(errorMessage(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  return { draft: draft?.actorId === actorId ? draft : null, loading, busy, uploading, phase, error, message, checked, deviceSavedAt, updateForm, capture, beginCapture, completeCapture, interruptCapture, isCaptureSessionActive, checkCapture, checkAddress, addressCheck,
    addressMatched: Boolean(draft && nativeAddressCheckMatches(draft, addressCheck)), document, send, checkUploads, checkRequest, dismiss, cancelUpload: () => uploadController.current?.abort(),
    differentServerDraft: Boolean(serverId && draft?.server?.id !== serverId), reloadServer, reload: () => { latest.current = null; setLoading(true); setGeneration(value => value + 1) } }
}

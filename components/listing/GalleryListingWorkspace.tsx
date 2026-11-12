'use client'

import { AssetPhoto } from './AssetPhoto'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ListingFields, listingInputClass, type ListingFieldValues } from './ListingFields'
import { LISTING_CATEGORIES, LISTING_FORM_SCHEMAS, LISTING_METADATA_SCHEMAS, listingMutationResultSchema, ownerListingDetailSchema, type ListingCategory } from '@/lib/contracts/listings'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'
import { clearWebListingCommand, normalizeWebListingCommand, persistWebListingCommand, readWebListingCommand, type WebListingCommand } from '@/lib/listings/wizard-recovery'
import { folderIdFromPath, videoExtensionForMime } from '@/lib/storage'
import { clearGalleryRecovery, galleryFileFingerprint, persistGalleryRecovery, readGalleryRecovery, readGalleryUpload, reselectedGalleryFileMatches, type GalleryBrowserRecovery, type GalleryUploadMarker } from '@/lib/listings/gallery-upload-recovery'
import type { DraftPayload } from '@/store/useRentralStore'
import { galleryDraftSnapshot } from '@/lib/listings/gallery-draft-state'

type Photo = { name: string; path: string | null; file: File | null; preview: string | null }
type Props = { actorId: string; allowed: boolean; permissionRevision: number; draft: DraftPayload | null; directPublishAllowed?: boolean; freePostingAllowed?: boolean }
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50'
const card = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
const messageFor = (error: unknown) => error instanceof Error ? error.message : 'This result could not be confirmed. Keep the original request and check its status.'

function defaults(category: ListingCategory, draft: DraftPayload | null): ListingFieldValues {
  const values: ListingFieldValues = { address: draft?.address ?? '', basePrice: draft?.basePrice ?? '', rentalIntent: 'rent', hostCapacity: 'owner', pricePeriod: category === 'house' ? 'year' : 'day', ...(category === 'boat' ? { hasCaptain: false } : {}) }
  for (const [key, value] of Object.entries(draft?.metadata ?? {})) {
    if (Object.hasOwn(LISTING_METADATA_SCHEMAS[category].shape, key) && (typeof value === 'string' || typeof value === 'boolean')) values[key] = value
  }
  return values
}

export function GalleryListingWorkspace({ actorId, allowed, permissionRevision, draft, directPublishAllowed = false, freePostingAllowed = false }: Props) {
  const router = useRouter()
  const [category, setCategory] = useState<ListingCategory>(draft?.category ?? 'house')
  const [photos, setPhotos] = useState<Photo[]>((draft?.galleryPhotos ?? []).map(path => ({ path, file: null, name: path.split('/').at(-1) ?? 'Saved photo', preview: null })))
  const [video, setVideo] = useState<File | null>(null)
  const [videoPath, setVideoPath] = useState<string | null>(draft?.videoPath ?? null)
  const [videoName, setVideoName] = useState<string | null>(null)
  const [document, setDocument] = useState<File | null>(null)
  const [documentPath, setDocumentPath] = useState<string | null>(draft?.documentPath ?? null)
  const [documentName, setDocumentName] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null)
  const [revision, setRevision] = useState<number | null>(draft?.revision ?? null)
  const [folderId, setFolderId] = useState(() => folderIdFromPath(draft?.videoPath ?? draft?.galleryPhotos?.[0] ?? draft?.documentPath ?? null) ?? crypto.randomUUID())
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const savedSnapshot = useRef(galleryDraftSnapshot({ category: draft?.category ?? 'house', form: defaults(draft?.category ?? 'house', draft), photos: (draft?.galleryPhotos ?? []).map(path => ({ path, name: '' })), videoPath: draft?.videoPath ?? null, videoName: null, documentPath: draft?.documentPath ?? null, documentName: null }))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<WebListingCommand | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [recoveryError, setRecoveryError] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [pendingUpload, setPendingUpload] = useState<GalleryUploadMarker | null>(null)
  const [uploadCanRetry, setUploadCanRetry] = useState(false)
  const [uploadRead, setUploadRead] = useState(false)
  const [abandonReviewed, setAbandonReviewed] = useState(false)
  const [retryFile, setRetryFile] = useState<File | null>(null)
  const [otherWorkspace, setOtherWorkspace] = useState<GalleryBrowserRecovery | null>(null)
  const savedRecovery = useRef<GalleryBrowserRecovery | null>(null)
  const currentUpload = useRef<GalleryUploadMarker | null>(null)
  const active = useRef(true)
  const sending = useRef(false)
  const previews = useRef<string[]>([])
  const { register, getValues, reset, setError, clearErrors, subscribe, formState: { errors } } = useForm<ListingFieldValues>({ defaultValues: defaults(category, draft) })
  useEffect(() => {
    active.current = true
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      try {
        setPending(readWebListingCommand(actorId))
        const saved = readGalleryRecovery(actorId)
        if (saved && saved.routeDraftId !== (draft?.id ?? null) && saved.draftId !== (draft?.id ?? null)) { setOtherWorkspace(saved); setHydrated(true); return }
        savedRecovery.current = saved ?? { version: 1, actorId, routeDraftId: draft?.id ?? null, draftId, revision, folderId, category, form: getValues(), photos: photos.map(photo => ({ name: photo.name, path: photo.path })), videoPath, videoName, documentPath, documentName, pendingUpload: null }
        if (saved) {
          setCategory(saved.category); setFolderId(saved.folderId); setDraftId(saved.draftId); setRevision(saved.revision); reset(saved.form)
          setPhotos(saved.photos.map(photo => ({ ...photo, file: null, preview: null }))); setVideoPath(saved.videoPath); setVideoName(saved.videoName); setDocumentPath(saved.documentPath); setDocumentName(saved.documentName)
          currentUpload.current = saved.pendingUpload; setPendingUpload(saved.pendingUpload)
          setNeedsRefresh(saved.needsRefresh ?? false)
          if (saved.pendingUpload) setMessage('An earlier file upload needs readback. Its original path and form are kept; no file or listing request was repeated.')
        }
      }
      catch { setRecoveryError(true); setMessage('Your saved listing instruction could not be read. Review Your Listings before clearing browser site storage.') }
      if (savedRecovery.current) setHasUnsavedChanges(galleryDraftSnapshot(savedRecovery.current) !== savedSnapshot.current)
      setHydrated(true)
    })
    return () => { current = false; active.current = false; for (const url of previews.current) URL.revokeObjectURL(url); previews.current = [] }
    // This workspace is keyed by actor and route draft. Form/file changes are
    // saved below; rehydration must run only for that identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId])
  useEffect(() => {
    if (!hydrated || otherWorkspace || recoveryError) return
    return subscribe({ formState: { values: true }, callback: ({ values }) => {
      if (sending.current || currentUpload.current || !savedRecovery.current || !active.current) return
      try { savedRecovery.current = persistGalleryRecovery({ ...savedRecovery.current, form: values }); setHasUnsavedChanges(galleryDraftSnapshot(savedRecovery.current) !== savedSnapshot.current) }
      catch (error) { setRecoveryError(true); setMessage(messageFor(error)) }
    } })
  }, [hydrated, otherWorkspace, recoveryError, subscribe])

  useEffect(() => {
    if (!hasUnsavedChanges && !pending && !pendingUpload) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [hasUnsavedChanges, pending, pendingUpload])

  function remember(patch: Partial<GalleryBrowserRecovery>, expectedPendingPath?: string): GalleryBrowserRecovery {
    stillCurrent()
    if (!savedRecovery.current) throw new Error('Open the saved gallery workspace before changing its recovery.')
    const saved = persistGalleryRecovery({ ...savedRecovery.current, form: getValues(), ...patch }, expectedPendingPath)
    savedRecovery.current = saved
    setHasUnsavedChanges(galleryDraftSnapshot(saved) !== savedSnapshot.current)
    return saved
  }

  async function run(task: () => Promise<void>): Promise<void> {
    if (sending.current) return
    sending.current = true; setBusy(true); setMessage('')
    try { await task() } catch (error) { if (active.current) setMessage(messageFor(error)) }
    finally { sending.current = false; if (active.current) setBusy(false) }
  }
  function stillCurrent(): void { if (!active.current) throw new Error('This listing is no longer open. Reopen your draft to continue.') }
  function choosePhotos(files: FileList | null): void {
    if (!files) return
    const incoming = Array.from(files)
    if (incoming.length + photos.length > 10) { setMessage('Choose up to ten photos in total. Remove a photo before adding another.'); return }
    if (incoming.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024)) { setMessage('Choose JPEG or PNG photos up to 10 MB each.'); return }
    const selected = incoming.map(file => { const preview = URL.createObjectURL(file); previews.current.push(preview); return { file, preview, path: null, name: file.name } })
    try { const next = [...photos, ...selected]; remember({ photos: next.map(photo => ({ name: photo.name, path: photo.path })) }); setPhotos(next); setMessage('') }
    catch (error) { setMessage(messageFor(error)) }
  }
  function selectFile(kind: 'video' | 'document', file: File | null): void {
    if (!file) return
    const types = kind === 'video' ? ['video/mp4', 'video/quicktime', 'video/webm'] : ['application/pdf', 'image/jpeg', 'image/png']
    if (!types.includes(file.type) || file.size <= 0 || file.size > (kind === 'video' ? 200 : 10) * 1024 * 1024) { setMessage(kind === 'video' ? 'Choose an MP4, MOV or WebM video up to 200 MB.' : 'Choose a PDF, JPEG or PNG document up to 10 MB.'); return }
    try {
      remember(kind === 'video' ? { videoName: file.name, videoPath: null } : { documentName: file.name, documentPath: null })
      if (kind === 'video') { setVideo(file); setVideoPath(null); setVideoName(file.name) } else { setDocument(file); setDocumentPath(null); setDocumentName(file.name) }
    } catch (error) { setMessage(messageFor(error)) }
  }
  function removePhoto(index: number): void {
    try { const next = photos.filter((_, position) => position !== index); remember({ photos: next.map(photo => ({ name: photo.name, path: photo.path })) }); setPhotos(next) }
    catch (error) { setMessage(messageFor(error)) }
  }
  function reselectPhoto(index: number, file: File | null): void {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) { setMessage('Choose a JPEG or PNG photo up to 10 MB.'); return }
    try {
      const preview = URL.createObjectURL(file); previews.current.push(preview)
      const next = photos.map((photo, position) => position === index ? { name: file.name, file, path: null, preview } : photo)
      remember({ photos: next.map(photo => ({ name: photo.name, path: photo.path })) }); setPhotos(next)
    } catch (error) { setMessage(messageFor(error)) }
  }
  function removeFile(kind: 'video' | 'document'): void {
    try {
      remember(kind === 'video' ? { videoPath: null, videoName: null } : { documentPath: null, documentName: null })
      if (kind === 'video') { setVideo(null); setVideoPath(null); setVideoName(null) } else { setDocument(null); setDocumentPath(null); setDocumentName(null) }
    } catch (error) { setMessage(messageFor(error)) }
  }
  function adoptUpload(marker: GalleryUploadMarker): void {
    stillCurrent()
    if (currentUpload.current?.path !== marker.path || !savedRecovery.current) throw new Error('This upload result no longer belongs to the current recovery.')
    const patch = marker.kind === 'photo' ? { photos: savedRecovery.current.photos.map((photo, index) => index === marker.photoIndex ? { ...photo, path: marker.path } : photo) }
      : marker.kind === 'video' ? { videoPath: marker.path, videoName: marker.name } : { documentPath: marker.path, documentName: marker.name }
    remember({ ...patch, pendingUpload: null }, marker.path)
    if (marker.kind === 'photo') setPhotos(current => current.map((photo, index) => index === marker.photoIndex ? { ...photo, path: marker.path } : photo))
    else if (marker.kind === 'video') { setVideoPath(marker.path); setVideoName(marker.name) } else { setDocumentPath(marker.path); setDocumentName(marker.name) }
    currentUpload.current = null; setPendingUpload(null); setUploadCanRetry(false); setUploadRead(false); setAbandonReviewed(false); setRetryFile(null)
  }
  async function postUpload(file: File, marker: GalleryUploadMarker): Promise<void> {
    stillCurrent()
    if (!allowed) throw new Error('Gallery approval is no longer active. Readback remains available, but retrying requires current administrator approval.')
    remember({ pendingUpload: marker }, marker.path)
    // Every explicit attempt consumes prior readback eligibility. A second lost
    // acknowledgement needs another GET rather than a chain of blind retries.
    setUploadCanRetry(false); setUploadRead(false); setAbandonReviewed(false)
    const suffix = marker.bucket === 'listings-media' ? `?mediaSource=approved_gallery&permissionRevision=${permissionRevision}` : ''
    let response: Response
    try { response = await fetch(`/api/v1/uploads/${marker.bucket}${suffix}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Rentral-Account': actorId, 'X-Upload-Path': marker.path, 'Content-Type': marker.contentType }, body: file, signal: AbortSignal.timeout(180000) }) }
    catch { throw new Error('The upload could not be confirmed. Its original path and selected file are kept. Check the saved upload before retrying.') }
    let body: unknown
    try { body = await response.json() } catch { throw new Error('The upload response could not be confirmed. Check its saved status before retrying.') }
    const result = z.object({ success: z.literal(true), data: z.object({ path: z.string().max(500) }) }).safeParse(body)
    if (!response.ok || !result.success || result.data.data.path !== marker.path) {
      const failure = z.object({ error: z.string().max(1000) }).safeParse(body)
      throw new Error(failure.success ? failure.data.error : 'This upload could not be confirmed.')
    }
    stillCurrent()
  }
  async function upload(file: File, bucket: 'listings-media' | 'compliance-docs', path: string, kind: GalleryUploadMarker['kind'], photoIndex: number | null = null): Promise<string> {
    if (currentUpload.current) throw new Error('Check the original file upload before preparing another.')
    const marker: GalleryUploadMarker = { kind, photoIndex, bucket, path, name: file.name, size: file.size, contentType: file.type as GalleryUploadMarker['contentType'], fingerprintVersion: 'chunked-sha256-v1', fingerprint: await galleryFileFingerprint(file) }
    stillCurrent(); remember({ pendingUpload: marker }); currentUpload.current = marker; setPendingUpload(marker); setRetryFile(file)
    const url = new URL(window.location.href); url.searchParams.set('gallery', '1'); window.history.replaceState(window.history.state, '', url.pathname + url.search)
    await postUpload(file, marker); adoptUpload(marker)
    return marker.path
  }
  async function checkUpload(): Promise<void> {
    const marker = currentUpload.current
    if (!marker) return
    setUploadCanRetry(false); setUploadRead(false); setAbandonReviewed(false)
    try { await readGalleryUpload(actorId, marker); stillCurrent(); adoptUpload(marker); setMessage('The original upload is confirmed and its owned file was adopted. No file or listing request was sent. Continue saving when ready.') }
    catch (error) {
      stillCurrent()
      if (error instanceof CaptureRequestError && (error.status === 409 && error.code === 'UPLOAD_UNCONFIRMED' || error.status === 404 && error.code === 'NOT_FOUND')) { setUploadCanRetry(true); setUploadRead(true); setMessage('No available upload was confirmed at the original path. Keep checking if it may still be processing. An explicit retry uses that same path and original file; after reload, reselect it first.'); return }
      throw error
    }
  }
  async function reselectUpload(file: File | null): Promise<void> {
    const marker = currentUpload.current
    if (!file || !marker) return
    if (!await reselectedGalleryFileMatches(file, marker)) throw new Error('This is not the original file. Reselect the same file contents and type; the saved path has not changed.')
    stillCurrent(); setRetryFile(file); setMessage('The reselected file matches the original content fingerprint. It has not been uploaded again.')
  }
  async function retryUpload(): Promise<void> {
    const marker = currentUpload.current
    if (!marker || !uploadCanRetry || !retryFile || !allowed) return
    await postUpload(retryFile, marker); adoptUpload(marker); setMessage('The original upload path is confirmed. No listing request was repeated; continue saving when ready.')
  }
  async function abandonUpload(): Promise<void> {
    const marker = currentUpload.current
    if (!marker || !uploadRead || !abandonReviewed || !savedRecovery.current) return
    const patch = marker.kind === 'photo' ? { photos: savedRecovery.current.photos.filter((_, index) => index !== marker.photoIndex) }
      : marker.kind === 'video' ? { videoName: null, videoPath: null } : { documentName: null, documentPath: null }
    remember({ ...patch, pendingUpload: null }, marker.path)
    if (marker.kind === 'photo') setPhotos(current => current.filter((_, index) => index !== marker.photoIndex))
    else if (marker.kind === 'video') { setVideo(null); setVideoPath(null); setVideoName(null) } else { setDocument(null); setDocumentPath(null); setDocumentName(null) }
    currentUpload.current = null; setPendingUpload(null); setRetryFile(null); setUploadCanRetry(false); setUploadRead(false); setAbandonReviewed(false)
    setMessage('The selected upload was abandoned after readback. Other confirmed paths and form values are kept. No server file, listing or history was deleted.')
  }
  async function refreshSaved(id = draftId): Promise<void> {
    if (!id) throw new Error('No saved listing is available yet.')
    const row = await listingRequest(actorId, `/api/v1/my-listings/${id}`, ownerListingDetailSchema)
    stillCurrent()
    if (row.id !== id || row.mediaSource !== 'approved_gallery') throw new Error('The saved gallery listing could not be confirmed.')
    setDraftId(row.id); setRevision(row.revision); setCategory(row.category)
    setPhotos((row.galleryPhotos ?? []).map(path => ({ path, file: null, name: path.split('/').at(-1) ?? 'Saved photo', preview: null })))
    setVideo(null); setVideoPath(row.videoPath); setDocument(null); setDocumentPath(row.documentPath)
    setVideoName(null); setDocumentName(null)
    const form = defaults(row.category, { ...row, metadata: row.metadata })
    savedSnapshot.current = galleryDraftSnapshot({ category: row.category, form, photos: (row.galleryPhotos ?? []).map(path => ({ path, name: '' })), videoPath: row.videoPath, videoName: null, documentPath: row.documentPath, documentName: null })
    remember({ draftId: row.id, revision: row.revision, category: row.category, form, photos: (row.galleryPhotos ?? []).map(path => ({ path, name: path.split('/').at(-1) ?? 'Saved photo' })),
      videoPath: row.videoPath, videoName: null, documentPath: row.documentPath, documentName: null, pendingUpload: null, needsRefresh: false })
    reset(form)
    setNeedsRefresh(false)
  }
  async function send(command: WebListingCommand, exitAfter = false): Promise<void> {
    setCanRetry(false)
    let confirmed = false
    try {
      const result = await listingRequest(actorId, '/api/v1/my-listings', listingMutationResultSchema, command)
      if (command.listing.draftId && result.id !== command.listing.draftId) throw new Error('This response belongs to another listing.')
      confirmed = true; stillCurrent(); remember({ draftId: result.id, needsRefresh: true }); clearWebListingCommand(actorId, command.listing.clientId)
      if (!active.current) return
      setPending(null); setCanRetry(false); setDraftId(result.id); setNeedsRefresh(true)
      if (command.mode === 'submit') { clearGalleryRecovery(actorId); router.push(`/marketplace/listing?submitted=${encodeURIComponent(result.id)}`); return }
      await refreshSaved(result.id)
      if (exitAfter) { router.push(`/marketplace/listing?status=draft&saved=${encodeURIComponent(result.id)}`); return }
      if (active.current) setMessage('Gallery draft saved. You can safely return to it from Your Listings.')
    } catch (error) {
      if (confirmed) throw new Error('The listing was saved, but its latest details could not refresh. Refresh the saved record before editing further.')
      const rejected = error instanceof CaptureRequestError && error.status >= 400 && error.status < 500 && error.code !== 'INVALID_RESPONSE'
      if (rejected) { clearWebListingCommand(actorId, command.listing.clientId); if (active.current) { setPending(null); setCanRetry(false) } }
      throw error
    }
  }
  async function save(mode: 'draft' | 'submit', exitAfter = false): Promise<void> {
    if (!allowed || pending || currentUpload.current || recoveryError || needsRefresh || otherWorkspace) return
    clearErrors()
    const values = getValues()
    if (videoName && !video && !videoPath) throw new Error('Reselect the selected video after reload, or explicitly remove it before saving.')
    if (documentName && !document && !documentPath) throw new Error('Reselect the selected authority document after reload, or explicitly remove it before saving.')
    remember({ category, form: values })
    if (mode === 'submit') {
      const checked = LISTING_FORM_SCHEMAS[category].safeParse(values)
      if (!checked.success) {
        for (const issue of checked.error.issues) if (typeof issue.path[0] === 'string') setError(issue.path[0], { message: issue.message })
        throw new Error('Complete the highlighted listing details before submitting.')
      }
      if (!photos.length && !video && !videoPath) throw new Error('Choose at least one photo or a video before submitting.')
      if (!document && !documentPath) throw new Error('Upload your ownership or listing-authority document for human review.')
    }
    const uploadedPhotos: Photo[] = []
    for (const [index, photo] of photos.entries()) {
      const path = photo.path ?? (photo.file ? await upload(photo.file, 'listings-media', `${actorId}/${folderId}/${crypto.randomUUID()}.${photo.file.type === 'image/png' ? 'png' : 'jpg'}`, 'photo', index) : null)
      if (!path) throw new Error('A selected photo is unavailable. Choose it again.')
      uploadedPhotos.push({ ...photo, path })
      stillCurrent(); setPhotos(current => current.map(item => item === photo ? { ...item, path } : item))
    }
    let uploadedVideo = videoPath
    if (video && !uploadedVideo) { uploadedVideo = await upload(video, 'listings-media', `${actorId}/${folderId}/${crypto.randomUUID()}.${videoExtensionForMime(video.type)}`, 'video'); setVideoPath(uploadedVideo) }
    let uploadedDocument = documentPath
    if (document && !uploadedDocument) { const extension = document.type === 'application/pdf' ? 'pdf' : document.type === 'image/png' ? 'png' : 'jpg'; uploadedDocument = await upload(document, 'compliance-docs', `${actorId}/${folderId}/${crypto.randomUUID()}.${extension}`, 'document'); setDocumentPath(uploadedDocument) }
    stillCurrent()
    const { address, basePrice, ...metadata } = values
    const command = normalizeWebListingCommand({ mode, listing: { clientId: crypto.randomUUID(), ...(draftId ? { draftId, expectedRevision: revision ?? 0 } : {}),
      category, mediaSource: 'approved_gallery', galleryPhotos: uploadedPhotos.map(photo => photo.path), metadata, address: String(address ?? ''), basePrice: String(basePrice ?? ''),
      ...(mode === 'draft' ? { wizardStep: 'details' } : {}), ...(uploadedVideo ? { videoPath: uploadedVideo } : {}), ...(uploadedDocument ? { documentPath: uploadedDocument } : {}) } })
    persistWebListingCommand(actorId, command); setPending(command); setCanRetry(false)
    await send(command, exitAfter)
  }
  async function checkPending(): Promise<void> {
    if (!pending) return
    setCanRetry(false)
    try {
      const result = await listingRequest(actorId, `/api/v1/my-listings/requests/${pending.listing.clientId}?mode=${pending.mode}`, listingMutationResultSchema)
      if (pending.listing.draftId && result.id !== pending.listing.draftId) throw new Error('The recovered result belongs to another listing.')
      stillCurrent(); remember({ draftId: result.id, needsRefresh: true }); clearWebListingCommand(actorId, pending.listing.clientId)
      stillCurrent(); setPending(null); setCanRetry(false); setDraftId(result.id)
      if (pending.mode === 'submit') { clearGalleryRecovery(actorId); router.push(`/marketplace/listing?submitted=${encodeURIComponent(result.id)}`); return }
      setNeedsRefresh(true); await refreshSaved(result.id); setMessage('Your original draft was saved. It was not sent again.')
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status === 404) { if (active.current) { setCanRetry(true); setMessage('No saved receipt exists yet. You may explicitly resend the exact original request.') } return }
      throw error
    }
  }
  const blocked = busy || Boolean(pending) || Boolean(pendingUpload) || Boolean(otherWorkspace) || recoveryError || needsRefresh || !allowed || !hydrated

  return <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
    <header><Link href="/marketplace/listing" className="text-sm text-text-muted min-h-11 max-w-full break-words inline-flex items-center">← Your Listings</Link><p className="mt-6 text-xs font-semibold uppercase tracking-widest text-accent-hover">Approved gallery uploader</p><h1 className="mt-3 text-2xl font-semibold break-words">{draftId ? 'Gallery listing draft' : 'Create a gallery listing'}</h1><p className="mt-3 text-sm leading-6 text-text-secondary">Choose photos and an optional video. Your admin-approved upload permission replaces recording and address-location checks. {directPublishAllowed ? 'Your account can publish directly once all required checks are complete.' : 'A human reviews your listing and authority document before publication.'}</p><p className="mt-2 text-xs leading-5 text-text-muted">This listing will be labelled as gallery media with an unverified recording location. Inspections use manual review.</p></header>
    <section className={card + ' flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'} aria-label="Draft saving">
      <div className="min-w-0"><h2 className="text-sm font-semibold">{hasUnsavedChanges ? 'Changes not saved to your account' : draftId ? 'Draft saved to your account' : 'Save your progress at any time'}</h2><p className="mt-1 text-xs leading-5 text-text-muted">{pending || pendingUpload || needsRefresh ? 'Confirm the original request below before editing again.' : 'Save incomplete details now and add media or documents later. Browser recovery is separate from a saved account draft.'}</p></div>
      <div className="flex shrink-0 flex-wrap gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { void run(() => save('draft')) }}>Save draft</button><button type="button" className={button} disabled={blocked} onClick={() => { void run(() => save('draft', true)) }}>Save and exit</button></div>
    </section>
    {!allowed && <p role="alert" className="rounded-xl border border-glass-border-warning p-4 text-sm text-text-secondary">Gallery permission is no longer active. Your saved draft is retained. Contact an administrator before submitting.</p>}
    {otherWorkspace && <section className={card}><h2 className="font-semibold break-words">Another gallery draft has browser recovery</h2><p className="mt-3 text-sm leading-6 text-text-secondary">Its form, confirmed files and original upload path are kept. Resume that workspace before preparing different media.</p><Link className={button + ' mt-4'} href={`/marketplace/listing/create?gallery=1${otherWorkspace.draftId || otherWorkspace.routeDraftId ? `&draft=${otherWorkspace.draftId ?? otherWorkspace.routeDraftId}` : ''}`}>Resume original gallery recovery</Link></section>}
    {message && <p role="status" className="break-words rounded-xl border border-border-subtle p-4 text-sm leading-6 text-text-secondary">{message}</p>}
    {pendingUpload && <section className={card}><h2 className="font-semibold break-words">Confirm the original file upload</h2><p className="mt-3 break-all text-sm text-text-secondary">{pendingUpload.name} · {Math.ceil(pendingUpload.size / 1024)} KB</p><p className="mt-3 text-sm leading-6 text-text-muted">The intended upload path was kept before sending this file. Check it before retrying. Reloading loses browser file access, but a confirmed owned upload can be recovered without selecting or uploading it again.</p>
      <button className={button + ' mt-4'} disabled={busy} onClick={() => { void run(checkUpload) }}>Check original upload</button>
      {!retryFile && <label className="mt-4 block text-xs text-text-muted min-w-0 max-w-full">Reselect original upload<input className={listingInputClass + ' mt-2'} type="file" accept={pendingUpload.contentType} disabled={busy} onChange={event => { const file = event.target.files?.[0] ?? null; event.target.value = ''; void run(() => reselectUpload(file)) }} /></label>}
      {retryFile && <p className="mt-3 break-all text-xs text-text-secondary">Original file available: {retryFile.name}</p>}
      {uploadCanRetry && <button className={button + ' mt-4'} disabled={busy || !allowed || !retryFile} onClick={() => { void run(retryUpload) }}>Retry exact original upload</button>}
      {uploadRead && <div className="mt-5 space-y-3 border-t border-border-subtle pt-4"><p className="text-xs leading-5 text-text-muted">If this file was permanently rejected, review the readback and <Link href="/marketplace/listing" className="underline min-h-11 max-w-full break-words inline-flex items-center">Your Listings</Link> before abandoning its browser recovery. This does not delete or cancel any server file, listing or history.</p><label className="flex items-start gap-3 text-xs leading-5 text-text-secondary min-w-0 max-w-full"><input type="checkbox" checked={abandonReviewed} disabled={busy} onChange={event => setAbandonReviewed(event.target.checked)} />I reviewed the upload readback and my listings.</label><button className={button} disabled={busy || !abandonReviewed} onClick={() => { void run(abandonUpload) }}>Abandon reviewed original upload</button></div>}
    </section>}
    {pending && <section className={card}><h2 className="font-semibold break-words">Confirm the original listing request</h2><p className="mt-3 break-all text-xs text-text-muted">{pending.mode} · {pending.listing.clientId}</p><p className="mt-3 text-sm leading-6 text-text-secondary">New edits are paused until this result is known. Status checks do not send another save.</p><div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => { void run(checkPending) }}>Check original request</button>{canRetry && <button className={button} disabled={busy || !allowed} onClick={() => { void run(() => send(pending)) }}>Resend exact saved request</button>}</div></section>}
    {needsRefresh && !pending && <button className={button} disabled={busy} onClick={() => { void run(() => refreshSaved()) }}>Refresh saved listing</button>}
    <form onSubmit={event => { event.preventDefault(); void run(() => save('submit')) }}><fieldset disabled={blocked} className="min-w-0 space-y-6 max-w-full">
      <section className={card}><label className="text-xs text-text-muted min-w-0 max-w-full">Asset type<select className={listingInputClass + ' mt-2'} value={category} disabled={Boolean(draftId) || blocked} onChange={event => { const parsed = z.enum(LISTING_CATEGORIES).safeParse(event.target.value); if (parsed.success) { try { const form = defaults(parsed.data, null); remember({ category: parsed.data, form }); setCategory(parsed.data); reset(form) } catch (error) { setMessage(messageFor(error)) } } }}>{LISTING_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label></section>
      <section className={card}><h2 className="font-semibold break-words">Photos and video</h2><p className="mt-3 text-xs leading-5 text-text-muted">Up to 10 JPEG/PNG photos, 10 MB each, and one optional video up to 120 seconds and 200 MB. One photo is enough for a photo-only listing.</p><label className="mt-4 block text-xs text-text-muted min-w-0 max-w-full">Add photos<input className={listingInputClass + ' mt-2'} type="file" accept="image/jpeg,image/png" multiple onChange={event => { choosePhotos(event.target.files); event.target.value = '' }} /></label>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <article key={photo.path ?? photo.preview ?? index} className="min-w-0 rounded-xl border border-border-subtle p-3">{photo.preview ? <div className="relative aspect-square overflow-hidden rounded-lg"><AssetPhoto src={photo.preview} alt={`Selected gallery photo ${index + 1}`} sizes="(min-width:640px) 240px,50vw" /></div> : <p className="flex aspect-square items-center justify-center rounded-lg bg-background-app text-xs text-text-muted">{photo.path ? `Saved photo ${index + 1}` : `Reselect photo ${index + 1}`}</p>}<p className="mt-2 break-all text-xs text-text-muted">{photo.name}</p>{!photo.path && !photo.file && <label className="mt-2 block text-xs text-text-muted min-w-0 max-w-full">Reselect photo {index + 1}<input type="file" accept="image/jpeg,image/png" className={listingInputClass + ' mt-2'} onChange={event => { reselectPhoto(index, event.target.files?.[0] ?? null); event.target.value = '' }} /></label>}<button type="button" className={button + ' mt-2 w-full'} onClick={() => removePhoto(index)}>Remove photo</button></article>)}</div>
        <label className="mt-5 block text-xs text-text-muted min-w-0 max-w-full">Optional video<input className={listingInputClass + ' mt-2'} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={event => { selectFile('video', event.target.files?.[0] ?? null); event.target.value = '' }} /></label>{(video || videoPath || videoName) && <p className="mt-3 break-all text-xs text-text-secondary">{video?.name ?? videoName ?? 'Saved video'} <button type="button" className={button + ' ml-2'} onClick={() => removeFile('video')}>Remove video</button></p>}</section>
      <section className={card}><ListingFields category={category} register={register} errors={errors} /></section>
      <section className={card}><h2 className="font-semibold break-words">Ownership or listing authority</h2><p className="mt-3 text-sm leading-6 text-text-muted">Provide the title deed, Certificate of Occupancy or signed authority for an administrator to review privately.</p><label className="mt-4 block text-xs text-text-muted min-w-0 max-w-full">Private authority document<input className={listingInputClass + ' mt-2'} type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => { selectFile('document', event.target.files?.[0] ?? null); event.target.value = '' }} /></label>{(document || documentPath || documentName) && <p className="mt-3 break-all text-xs text-text-secondary">{document?.name ?? documentName ?? documentPath?.split('/').at(-1)} <button type="button" className={button + ' ml-2'} onClick={() => removeFile('document')}>Remove authority document</button></p>}</section>
      <div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => { void run(() => save('draft')) }}>{busy ? 'Saving…' : 'Save gallery draft'}</button><button className={button + ' bg-accent-primary text-text-inverse'}>{busy ? 'Submitting…' : directPublishAllowed ? 'Publish listing' : 'Submit for review'}</button></div><p className="text-xs leading-5 text-text-muted">{directPublishAllowed ? 'Direct publishing is enabled for your account. Required media and document checks still apply.' : 'Publication requires human approval.'} {freePostingAllowed ? 'Your account can post for free.' : 'The publication fee applies unless an administrator grants a waiver.'} Selecting files does not publish your listing.</p>
    </fieldset></form>
  </div>
}

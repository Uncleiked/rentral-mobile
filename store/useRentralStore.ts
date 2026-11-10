import { create } from 'zustand'
import { folderIdFromPath } from '@/lib/storage'
import { DRAFT_WIZARD_STEPS, LISTING_CATEGORIES } from '../lib/contracts/listings'
import { clearBrowserCapturePending, clearWebListingCommand, discardWebRecovery, normalizeWebListingCommand, persistBrowserCapturePending, persistWebListingCommand, readBrowserCapturePending, readWebListingCommand, type BrowserCapturePending, type WebListingCommand } from '../lib/listings/wizard-recovery'
export { DRAFT_WIZARD_STEPS, LISTING_CATEGORIES } from '../lib/contracts/listings'

export type ListingCategory = (typeof LISTING_CATEGORIES)[number]

export type SharedListingMetadata = {
  listingTitle?: string
  description?: string
  rentalIntent?: 'rent' | 'buy' | 'squat' | 'shortlet' | ''
  hostCapacity?: 'owner' | 'agent' | 'tenant' | 'organization' | ''
  pricePeriod?: 'year' | 'month' | 'day' | 'trip' | ''
  state?: string
  neighborhood?: string
  agencyFee?: string
  legalFee?: string
  cautionFee?: string
  serviceCharge?: string
}

export type HouseMetadata = SharedListingMetadata & {
  bedrooms: string
  bathrooms: string
  sizeSqm: string
  amenities: string
  propertyType?: 'apartment' | 'studio' | 'room' | 'bungalow' | 'duplex' | 'terrace' | 'detached' | 'semi-detached' | 'other' | ''
  kitchens?: string
  floors?: string
  landlordPreferences?: string
}

export type CarMetadata = SharedListingMetadata & {
  transmission: 'automatic' | 'manual' | ''
  mileageKm: string
  seats: string
  fuelType: string
  bodyType?: string
  engineType?: string
  insuranceStatus?: 'insured' | 'not-insured' | 'not-provided' | ''
  insuranceDetails?: string
}

export type BoatMetadata = SharedListingMetadata & {
  vesselType: string
  capacityPersons: string
  hasCaptain: boolean
  lifeJackets?: boolean
  safetyEquipment?: string
}

export type ListingMetadata = {
  house: HouseMetadata
  car: CarMetadata
  boat: BoatMetadata
}

// GPS lock has no flag of its own — it is exactly `coords !== null`.
export type CaptureState = {
  hasStarted: boolean
  isRecording: boolean
  countdown: number
  isComplete: boolean
}

export type CaptureCoords = {
  lat: number
  lng: number
  accuracy: number
}

// Serializable draft state loaded from the server when resuming. Coordinates
// are deliberately absent — they never leave the server; `hasCoords` is the
// only client-visible trace (spatial privacy invariant).
export type DraftPayload = {
  id: string
  revision?: number
  captureId?: string | null
  mediaSource?: 'recorded' | 'approved_gallery'
  galleryPhotos?: string[]
  category: ListingCategory
  address: string
  basePrice: string
  metadata: Record<string, unknown> | null
  wizardStep: WizardStep | null
  videoPath: string | null
  posterPath: string | null
  documentPath: string | null
  documentName: string | null
  hasCoords: boolean
}

// Steps a draft can be saved at — 'done' means the listing is posted, so it
// is deliberately absent here and appended for the full wizard order below.
export const WIZARD_STEPS = [...DRAFT_WIZARD_STEPS, 'done'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

const initialCapture: CaptureState = {
  hasStarted: false,
  isRecording: false,
  countdown: 120,
  isComplete: false,
}

const initialSharedMetadata: SharedListingMetadata = {
  listingTitle: '', description: '', rentalIntent: 'rent', hostCapacity: 'owner', state: '', neighborhood: '',
  agencyFee: '', legalFee: '', cautionFee: '', serviceCharge: '',
}

const initialMetadata: ListingMetadata = {
  house: { ...initialSharedMetadata, pricePeriod: 'year', bedrooms: '', bathrooms: '', sizeSqm: '', amenities: '', propertyType: '', kitchens: '', floors: '', landlordPreferences: '' },
  car: { ...initialSharedMetadata, pricePeriod: 'day', transmission: '', mileageKm: '', seats: '', fuelType: '', bodyType: '', engineType: '', insuranceStatus: '', insuranceDetails: '' },
  boat: { ...initialSharedMetadata, pricePeriod: 'day', vesselType: '', capacityPersons: '', hasCaptain: false, lifeJackets: false, safetyEquipment: '' },
}

type RentralStore = {
  actorId: string | null
  generation: number
  pendingCommand: WebListingCommand | null
  pendingChecked: boolean
  pendingAttempted: boolean
  capturePending: BrowserCapturePending | null
  recoveryError: string | null
  step: WizardStep
  category: ListingCategory | null
  capture: CaptureState
  // Recorded artifacts live in memory only (no persist middleware): a page
  // refresh mid-wizard loses them unless saved as a draft first.
  videoBlob: Blob | null
  videoMimeType: string | null
  posterBlob: Blob | null
  coords: CaptureCoords | null
  captureId: string | null
  draftRevision: number | null
  mutationBusy: boolean
  metadata: ListingMetadata
  address: string
  basePrice: string
  documentFile: File | null
  // Draft linkage: set when resuming or after the first "Save Draft".
  draftListingId: string | null
  // Stable storage folder segment ({uid}/{mediaFolderId}/...) so draft saves
  // and the final post reuse one folder instead of scattering objects.
  mediaFolderId: string | null
  remoteVideoPath: string | null
  remotePosterPath: string | null
  remoteDocumentPath: string | null
  remoteDocumentName: string | null
  hasRemoteCoords: boolean

  setStep: (step: WizardStep) => void
  setActorId: (actorId: string) => void
  restoreRecovery: () => void
  advanceGeneration: () => void
  prepareListingCommand: (command: unknown) => WebListingCommand
  markPendingChecked: (clientId: string) => void
  claimListingCommand: (clientId: string) => WebListingCommand
  completeListingCommand: (clientId: string) => void
  setCapturePending: (pending: BrowserCapturePending) => void
  clearCapturePending: () => void
  discardRecoveryAfterReview: () => void
  goNext: () => void
  goBack: () => void
  setCategory: (category: ListingCategory) => void
  updateCapture: (patch: Partial<CaptureState>) => void
  setRecordedVideo: (blob: Blob, mimeType: string, poster: Blob | null) => void
  setCoords: (coords: CaptureCoords | null) => void
  setCaptureId: (captureId: string | null) => void
  setMutationBusy: (busy: boolean) => void
  resetCapture: () => void
  updateHouseMetadata: (patch: Partial<HouseMetadata>) => void
  updateCarMetadata: (patch: Partial<CarMetadata>) => void
  updateBoatMetadata: (patch: Partial<BoatMetadata>) => void
  setAddress: (address: string) => void
  setBasePrice: (basePrice: string) => void
  setDocumentFile: (file: File | null) => void
  ensureMediaFolderId: () => string
  rememberUploadedMedia: (media: { videoPath: string | null; posterPath: string | null; documentPath: string | null }) => void
  loadDraft: (draft: DraftPayload) => void
  reset: () => void
}

const initialDraftLinkage = {
  draftListingId: null as string | null,
  mediaFolderId: null as string | null,
  remoteVideoPath: null as string | null,
  remotePosterPath: null as string | null,
  remoteDocumentPath: null as string | null,
  remoteDocumentName: null as string | null,
  hasRemoteCoords: false,
}

export const useRentralStore = create<RentralStore>((set, get) => ({
  actorId: null,
  generation: 0,
  pendingCommand: null,
  pendingChecked: false,
  pendingAttempted: false,
  capturePending: null,
  recoveryError: null,
  step: 'category',
  category: null,
  capture: initialCapture,
  videoBlob: null,
  videoMimeType: null,
  posterBlob: null,
  coords: null,
  captureId: null,
  draftRevision: null,
  mutationBusy: false,
  metadata: initialMetadata,
  address: '',
  basePrice: '',
  documentFile: null,
  ...initialDraftLinkage,

  setStep: (step) => set({ step }),
  setActorId: (actorId) => {
    if (get().actorId !== actorId) {
      // Changing account must not delete the previous account's durable markers.
      set({ actorId, generation: get().generation + 1, pendingCommand: null, pendingChecked: false, pendingAttempted: false, capturePending: null, recoveryError: null,
        step: 'category', category: null, capture: initialCapture, videoBlob: null, videoMimeType: null, posterBlob: null, coords: null, captureId: null,
        draftRevision: null, mutationBusy: false, metadata: initialMetadata, address: '', basePrice: '', documentFile: null, ...initialDraftLinkage })
    }
    get().restoreRecovery()
  },
  restoreRecovery: () => {
    const current = get()
    if (!current.actorId) return
    try {
      const pending = current.pendingCommand ?? readWebListingCommand(current.actorId)
      const capturePending = current.capturePending ?? readBrowserCapturePending(current.actorId)
      if (pending && !current.pendingCommand) {
        const listing = pending.listing
        set({ pendingCommand: pending, pendingChecked: false, pendingAttempted: true, recoveryError: null, category: listing.category,
          step: pending.mode === 'draft' ? pending.listing.wizardStep : 'checkout', address: listing.address ?? '', basePrice: listing.basePrice ?? '',
          metadata: { ...initialMetadata, [listing.category]: { ...initialMetadata[listing.category], ...(listing.metadata && typeof listing.metadata === 'object' ? listing.metadata : {}) } },
          captureId: listing.captureId ?? null, remoteVideoPath: listing.videoPath ?? null, remotePosterPath: listing.posterPath ?? null, remoteDocumentPath: listing.documentPath ?? null,
          draftListingId: listing.draftId ?? null, draftRevision: listing.expectedRevision ?? null, hasRemoteCoords: Boolean(listing.captureId && listing.videoPath),
          capture: { ...initialCapture, hasStarted: Boolean(listing.videoPath), isComplete: Boolean(listing.videoPath) } })
      }
      if (capturePending) set({ capturePending, captureId: capturePending.id, step: 'capture', capture: { ...get().capture, hasStarted: true, isRecording: false, isComplete: false } })
    } catch (reason) { set({ recoveryError: reason instanceof Error ? reason.message : 'Browser recovery could not be confirmed. Review Your Listings before continuing.' }) }
  },
  advanceGeneration: () => set({ generation: get().generation + 1, mutationBusy: false, pendingChecked: false }),
  prepareListingCommand: (input) => {
    const current = get()
    if (!current.actorId || current.pendingCommand || current.capturePending || current.recoveryError) throw new Error('Confirm the saved listing or recording request before preparing different instructions.')
    const command = normalizeWebListingCommand(input)
    persistWebListingCommand(current.actorId, command)
    set({ pendingCommand: command, pendingChecked: false, pendingAttempted: false })
    return command
  },
  markPendingChecked: (clientId) => { if (get().pendingCommand?.listing.clientId === clientId) set({ pendingChecked: true }) },
  claimListingCommand: (clientId) => {
    const current = get(), command = current.pendingCommand
    if (!current.actorId || !command || command.listing.clientId !== clientId || current.pendingAttempted && !current.pendingChecked) throw new Error('Check the original saved request before explicitly retrying it.')
    persistWebListingCommand(current.actorId, command)
    set({ pendingAttempted: true, pendingChecked: false })
    return command
  },
  completeListingCommand: (clientId) => {
    const current = get()
    if (!current.actorId || current.pendingCommand?.listing.clientId !== clientId) throw new Error('This listing recovery result no longer matches the saved request.')
    clearWebListingCommand(current.actorId, clientId)
    set({ pendingCommand: null, pendingChecked: false, pendingAttempted: false })
  },
  setCapturePending: (pending) => {
    const current = get()
    if (!current.actorId || current.pendingCommand || current.recoveryError || current.capturePending && current.capturePending.id !== pending.id) throw new Error('Confirm the saved recording before preparing another take.')
    persistBrowserCapturePending(current.actorId, pending)
    set({ capturePending: pending })
  },
  clearCapturePending: () => {
    const current = get()
    if (!current.actorId || !current.capturePending) return
    clearBrowserCapturePending(current.actorId, current.capturePending.id)
    set({ capturePending: null })
  },
  discardRecoveryAfterReview: () => {
    const current = get()
    if (!current.actorId) return
    discardWebRecovery(current.actorId)
    set({ pendingCommand: null, pendingChecked: false, pendingAttempted: false, capturePending: null, recoveryError: null })
    get().reset()
  },
  goNext: () => {
    if (get().pendingCommand || get().capturePending || get().recoveryError || get().mutationBusy) return
    const index = WIZARD_STEPS.indexOf(get().step)
    const next = WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]
    set({ step: next })
  },
  goBack: () => {
    if (get().pendingCommand || get().capturePending || get().recoveryError || get().mutationBusy || get().capture.isRecording) return
    const index = WIZARD_STEPS.indexOf(get().step)
    const prev = WIZARD_STEPS[Math.max(index - 1, 0)]
    set({ step: prev })
  },
  setCategory: (category) => set({ category }),
  updateCapture: (patch) => set((state) => ({ capture: { ...state.capture, ...patch } })),
  setRecordedVideo: (videoBlob, videoMimeType, posterBlob) => set({ videoBlob, videoMimeType, posterBlob }),
  setCoords: (coords) => set({ coords }),
  setCaptureId: (captureId) => set({ captureId }),
  setMutationBusy: (mutationBusy) => set({ mutationBusy }),
  // Retake invalidates the previous take entirely — including a draft's
  // already-uploaded video and its server-side coordinates.
  resetCapture: () => {
    if (get().capturePending || get().pendingCommand || get().recoveryError) return
    set({
      generation: get().generation + 1,
      capture: initialCapture,
      videoBlob: null,
      videoMimeType: null,
      posterBlob: null,
      coords: null,
      captureId: null,
      remoteVideoPath: null,
      remotePosterPath: null,
      hasRemoteCoords: false,
    })
  },
  updateHouseMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, house: { ...state.metadata.house, ...patch } } })),
  updateCarMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, car: { ...state.metadata.car, ...patch } } })),
  updateBoatMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, boat: { ...state.metadata.boat, ...patch } } })),
  setAddress: (address) => set({ address }),
  setBasePrice: (basePrice) => set({ basePrice }),
  setDocumentFile: (documentFile) => set({ documentFile, ...(documentFile ? { remoteDocumentPath: null } : {}) }),
  rememberUploadedMedia: (media) => set({ remoteVideoPath: media.videoPath, remotePosterPath: media.posterPath, remoteDocumentPath: media.documentPath }),
  ensureMediaFolderId: () => {
    const existing = get().mediaFolderId
    if (existing) return existing
    const generated = crypto.randomUUID()
    set({ mediaFolderId: generated })
    return generated
  },
  loadDraft: (draft) => {
    if (get().pendingCommand || get().capturePending || get().recoveryError) return
    const hasVideo = draft.videoPath !== null
    set({
      generation: get().generation + 1,
      step: draft.wizardStep ?? 'category',
      category: draft.category,
      capture: { ...initialCapture, hasStarted: hasVideo, isComplete: hasVideo },
      videoBlob: null,
      videoMimeType: null,
      posterBlob: null,
      coords: null,
      captureId: draft.captureId ?? null,
      draftRevision: draft.revision ?? null,
      metadata: {
        ...initialMetadata,
        [draft.category]: { ...initialMetadata[draft.category], ...(draft.metadata ?? {}) },
      },
      address: draft.address,
      basePrice: draft.basePrice,
      documentFile: null,
      draftListingId: draft.id,
      // Reuse the draft's storage folder for later uploads.
      mediaFolderId: folderIdFromPath(draft.videoPath) ?? folderIdFromPath(draft.documentPath),
      remoteVideoPath: draft.videoPath,
      remotePosterPath: draft.posterPath,
      remoteDocumentPath: draft.documentPath,
      remoteDocumentName: draft.documentName,
      hasRemoteCoords: draft.hasCoords,
    })
  },
  reset: () => {
    if (get().pendingCommand || get().capturePending || get().recoveryError) return
    set({
      generation: get().generation + 1,
      step: 'category',
      category: null,
      capture: initialCapture,
      videoBlob: null,
      videoMimeType: null,
      posterBlob: null,
      coords: null,
      captureId: null,
      draftRevision: null,
      mutationBusy: false,
      metadata: initialMetadata,
      address: '',
      basePrice: '',
      documentFile: null,
      ...initialDraftLinkage,
    })
  },
}))

export function isWizardCurrent(actorId: string, generation: number): boolean {
  const current = useRentralStore.getState()
  return current.actorId === actorId && current.generation === generation
}

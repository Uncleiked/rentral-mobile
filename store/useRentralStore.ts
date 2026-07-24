import { create } from 'zustand'
import { folderIdFromPath } from '@/lib/storage'

export const LISTING_CATEGORIES = ['house', 'car', 'boat'] as const
export type ListingCategory = (typeof LISTING_CATEGORIES)[number]

export type HouseMetadata = {
  bedrooms: string
  bathrooms: string
  sizeSqm: string
  amenities: string
}

export type CarMetadata = {
  transmission: 'automatic' | 'manual' | ''
  mileageKm: string
  seats: string
  fuelType: string
}

export type BoatMetadata = {
  vesselType: string
  capacityPersons: string
  hasCaptain: boolean
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
export const DRAFT_WIZARD_STEPS = ['category', 'capture', 'details', 'documents', 'checkout'] as const
export const WIZARD_STEPS = [...DRAFT_WIZARD_STEPS, 'done'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

const initialCapture: CaptureState = {
  hasStarted: false,
  isRecording: false,
  countdown: 120,
  isComplete: false,
}

const initialMetadata: ListingMetadata = {
  house: { bedrooms: '', bathrooms: '', sizeSqm: '', amenities: '' },
  car: { transmission: '', mileageKm: '', seats: '', fuelType: '' },
  boat: { vesselType: '', capacityPersons: '', hasCaptain: false },
}

type RentralStore = {
  step: WizardStep
  category: ListingCategory | null
  capture: CaptureState
  // Recorded artifacts live in memory only (no persist middleware): a page
  // refresh mid-wizard loses them unless saved as a draft first.
  videoBlob: Blob | null
  videoMimeType: string | null
  posterBlob: Blob | null
  coords: CaptureCoords | null
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
  goNext: () => void
  goBack: () => void
  setCategory: (category: ListingCategory) => void
  updateCapture: (patch: Partial<CaptureState>) => void
  setRecordedVideo: (blob: Blob, mimeType: string, poster: Blob | null) => void
  setCoords: (coords: CaptureCoords) => void
  resetCapture: () => void
  updateHouseMetadata: (patch: Partial<HouseMetadata>) => void
  updateCarMetadata: (patch: Partial<CarMetadata>) => void
  updateBoatMetadata: (patch: Partial<BoatMetadata>) => void
  setAddress: (address: string) => void
  setBasePrice: (basePrice: string) => void
  setDocumentFile: (file: File | null) => void
  ensureMediaFolderId: () => string
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
  step: 'category',
  category: null,
  capture: initialCapture,
  videoBlob: null,
  videoMimeType: null,
  posterBlob: null,
  coords: null,
  metadata: initialMetadata,
  address: '',
  basePrice: '',
  documentFile: null,
  ...initialDraftLinkage,

  setStep: (step) => set({ step }),
  goNext: () => {
    const index = WIZARD_STEPS.indexOf(get().step)
    const next = WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)]
    set({ step: next })
  },
  goBack: () => {
    const index = WIZARD_STEPS.indexOf(get().step)
    const prev = WIZARD_STEPS[Math.max(index - 1, 0)]
    set({ step: prev })
  },
  setCategory: (category) => set({ category }),
  updateCapture: (patch) => set((state) => ({ capture: { ...state.capture, ...patch } })),
  setRecordedVideo: (videoBlob, videoMimeType, posterBlob) => set({ videoBlob, videoMimeType, posterBlob }),
  setCoords: (coords) => set({ coords }),
  // Retake invalidates the previous take entirely — including a draft's
  // already-uploaded video and its server-side coordinates.
  resetCapture: () =>
    set({
      capture: initialCapture,
      videoBlob: null,
      videoMimeType: null,
      posterBlob: null,
      coords: null,
      remoteVideoPath: null,
      remotePosterPath: null,
      hasRemoteCoords: false,
    }),
  updateHouseMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, house: { ...state.metadata.house, ...patch } } })),
  updateCarMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, car: { ...state.metadata.car, ...patch } } })),
  updateBoatMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, boat: { ...state.metadata.boat, ...patch } } })),
  setAddress: (address) => set({ address }),
  setBasePrice: (basePrice) => set({ basePrice }),
  setDocumentFile: (documentFile) => set({ documentFile }),
  ensureMediaFolderId: () => {
    const existing = get().mediaFolderId
    if (existing) return existing
    const generated = crypto.randomUUID()
    set({ mediaFolderId: generated })
    return generated
  },
  loadDraft: (draft) => {
    const hasVideo = draft.videoPath !== null
    set({
      step: draft.wizardStep ?? 'category',
      category: draft.category,
      capture: { ...initialCapture, hasStarted: hasVideo, isComplete: hasVideo },
      videoBlob: null,
      videoMimeType: null,
      posterBlob: null,
      coords: null,
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
  reset: () =>
    set({
      step: 'category',
      category: null,
      capture: initialCapture,
      videoBlob: null,
      videoMimeType: null,
      posterBlob: null,
      coords: null,
      metadata: initialMetadata,
      address: '',
      basePrice: '',
      documentFile: null,
      ...initialDraftLinkage,
    }),
}))

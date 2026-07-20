import { create } from 'zustand'

export type ListingCategory = 'house' | 'car' | 'boat'

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

export type CaptureState = {
  hasStarted: boolean
  isRecording: boolean
  countdown: number
  gpsLocked: boolean
  isComplete: boolean
}

export const WIZARD_STEPS = ['category', 'capture', 'details', 'documents', 'checkout', 'done'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

const initialCapture: CaptureState = {
  hasStarted: false,
  isRecording: false,
  countdown: 120,
  gpsLocked: false,
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
  metadata: ListingMetadata
  address: string
  basePrice: string
  documentFileName: string | null

  setStep: (step: WizardStep) => void
  goNext: () => void
  goBack: () => void
  setCategory: (category: ListingCategory) => void
  updateCapture: (patch: Partial<CaptureState>) => void
  updateHouseMetadata: (patch: Partial<HouseMetadata>) => void
  updateCarMetadata: (patch: Partial<CarMetadata>) => void
  updateBoatMetadata: (patch: Partial<BoatMetadata>) => void
  setAddress: (address: string) => void
  setBasePrice: (basePrice: string) => void
  setDocumentFileName: (fileName: string | null) => void
  reset: () => void
}

export const useRentralStore = create<RentralStore>((set, get) => ({
  step: 'category',
  category: null,
  capture: initialCapture,
  metadata: initialMetadata,
  address: '',
  basePrice: '',
  documentFileName: null,

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
  updateHouseMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, house: { ...state.metadata.house, ...patch } } })),
  updateCarMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, car: { ...state.metadata.car, ...patch } } })),
  updateBoatMetadata: (patch) =>
    set((state) => ({ metadata: { ...state.metadata, boat: { ...state.metadata.boat, ...patch } } })),
  setAddress: (address) => set({ address }),
  setBasePrice: (basePrice) => set({ basePrice }),
  setDocumentFileName: (documentFileName) => set({ documentFileName }),
  reset: () =>
    set({
      step: 'category',
      category: null,
      capture: initialCapture,
      metadata: initialMetadata,
      address: '',
      basePrice: '',
      documentFileName: null,
    }),
}))

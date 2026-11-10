'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LISTING_FORM_SCHEMAS } from '@/lib/schemas'
import { ListingFields, type ListingFieldValues } from '@/components/listing/ListingFields'
import {
  useRentralStore, isWizardCurrent,
  type BoatMetadata,
  type CarMetadata,
  type HouseMetadata,
} from '@/store/useRentralStore'
import { captureAddressResultSchema } from '@/lib/contracts/capture'
import { listingRequest } from '@/lib/listings/capture-client'
import { captureAddressMessage } from '@/lib/listings/address-check-message'

export function MetadataForm({ actorId }: { actorId: string }) {
  const [checking, setChecking] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const category = useRentralStore((state) => state.category)
  const generation = useRentralStore(state => state.generation)
  const metadata = useRentralStore((state) => state.metadata)
  const address = useRentralStore((state) => state.address)
  const basePrice = useRentralStore((state) => state.basePrice)
  const updateHouseMetadata = useRentralStore((state) => state.updateHouseMetadata)
  const updateCarMetadata = useRentralStore((state) => state.updateCarMetadata)
  const updateBoatMetadata = useRentralStore((state) => state.updateBoatMetadata)
  const setAddress = useRentralStore((state) => state.setAddress)
  const setBasePrice = useRentralStore((state) => state.setBasePrice)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  // Hooks must run unconditionally — fall back to 'house' when category isn't set yet,
  // then bail out below before rendering anything category-specific.
  const safeCategory = category ?? 'house'
  const defaultValues: ListingFieldValues = { ...metadata[safeCategory], address, basePrice }

  const { register, handleSubmit, subscribe, formState: { errors } } = useForm<ListingFieldValues>({
    resolver: zodResolver(LISTING_FORM_SCHEMAS[safeCategory]) as unknown as Resolver<ListingFieldValues>,
    defaultValues,
  })
  // Save Draft lives outside this form. Keep its snapshot current while typing,
  // including incomplete values that are valid for a recoverable draft.
  useEffect(() => {
    return subscribe({ formState: { values: true }, callback: ({ values }) => {
      const current = useRentralStore.getState()
      if (!category || !isWizardCurrent(actorId, generation) || current.category !== category || current.pendingCommand || current.capturePending || current.recoveryError || current.mutationBusy) return
      const { address: nextAddress, basePrice: nextBasePrice, ...rest } = values
      current.setAddress(String(nextAddress ?? '')); current.setBasePrice(String(nextBasePrice ?? ''))
      if (category === 'house') current.updateHouseMetadata(rest as Partial<HouseMetadata>)
      if (category === 'car') current.updateCarMetadata(rest as Partial<CarMetadata>)
      if (category === 'boat') current.updateBoatMetadata(rest as Partial<BoatMetadata>)
    } })
  }, [subscribe, actorId, generation, category])

  if (!category) return null

  const onSubmit = async (data: ListingFieldValues) => {
    const started = useRentralStore.getState()
    if (!isWizardCurrent(actorId, generation) || started.pendingCommand || started.capturePending || started.recoveryError || started.mutationBusy) return
    const { address: submittedAddress, basePrice: submittedBasePrice, ...rest } = data
    setAddress(String(submittedAddress))
    setBasePrice(String(submittedBasePrice))
    // The zod resolver already guaranteed the shape matches the category.
    if (category === 'house') updateHouseMetadata(rest as Partial<HouseMetadata>)
    if (category === 'car') updateCarMetadata(rest as Partial<CarMetadata>)
    if (category === 'boat') updateBoatMetadata(rest as Partial<BoatMetadata>)
    const captureId = useRentralStore.getState().captureId
    if (!captureId) { setAddressError('Record a new walkthrough to lock its location on the server before checking the address.'); return }
    setChecking(true); setAddressError(null)
    try {
      const result = await listingRequest(actorId, `/api/v1/captures/${captureId}/check-address?details=1`, captureAddressResultSchema, { address: String(submittedAddress).trim() })
      if (!active.current || !isWizardCurrent(actorId, generation)) return
      const current = useRentralStore.getState()
      if (current.captureId !== captureId || current.address.trim() !== String(submittedAddress).trim() || current.category !== category) { setAddressError('The recording or address changed. Check the address again.'); return }
      if (result.captureId !== captureId) { setAddressError('This address result belongs to a different recording. Check the current address again.'); return }
      if (result.status !== 'matched') { setAddressError(captureAddressMessage(result.status, result.reason)); return }
      goNext()
    } catch (reason) { if (active.current) setAddressError(reason instanceof Error ? reason.message : 'Address verification is unavailable. Your details have been kept.') }
    finally { if (active.current) setChecking(false) }
  }

  return (
    <form onSubmit={event => { void handleSubmit(onSubmit)(event) }} className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Asset details
        </h2>
        <p className="text-sm text-text-secondary">
          Structural information and pricing for your listing.
        </p>
      </div>

      <fieldset disabled={checking}><ListingFields category={category} register={register} errors={errors} /></fieldset>
      <p className="mt-3 text-xs text-text-muted">The entered address must resolve within 100 metres of your server-locked recording location. A precise match is required before submission.</p>
      {addressError ? <p role="alert" className="mt-3 text-sm text-trust-flagged">{addressError}</p> : null}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={checking}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={checking}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98"
        >
          {checking ? 'Checking address…' : 'Check address & continue'}
        </button>
      </div>
    </form>
  )
}

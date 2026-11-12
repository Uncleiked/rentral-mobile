import prisma from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import type { Prisma } from '@prisma/client'

import {
  boatMetadataSchema,
  carMetadataSchema,
  houseMetadataSchema,
  saveDraftInputSchema,
  saveListingInputSchema,
  updateListingInputSchema,
} from '@/lib/schemas'
import { revalidateProfilePaths } from '@/lib/action-helpers'
import { LISTING_STATUS } from '@/lib/listing-status'
import { captureServerEvent } from '@/lib/posthog'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { processListingMedia } from '@/lib/media/processing'
import { platformEnabled } from '@/lib/platform'
import { addressFingerprint, decodeGeographicPoint, distanceMetersWgs84, geocodeListingAddress, SPATIAL_TOLERANCE_METERS } from '@/lib/listings/spatial'
import { bindCaptureToListing, readCaptureForSubmission } from '@/lib/listings/capture'
import { ApiError } from '@/lib/api/http'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { claimStorageObjects, prepareListingStorage } from '@/lib/storage-claims/service'
import { StorageError } from '@/lib/local-storage/policy'
import { committedMutation, mutationCommand, transactionMutation, recordMutation, MutationConflictError, type MutationCommand } from '@/lib/database/mutations'
import { expireListingReservations } from '@/lib/bookings/service'
import { z } from 'zod'
import { AccountUnavailableError, assertActiveAccounts } from '@/lib/accounts/availability'
import { assertGalleryPermission, prepareGalleryMedia } from '@/lib/listings/gallery'
import { applySubmissionPublishing } from '@/lib/listings/publishing'

const METADATA_SCHEMAS = {
  house: houseMetadataSchema,
  car: carMetadataSchema,
  boat: boatMetadataSchema,
} as const

type ActionFailure = { success: false; error: string; uncertain?: boolean; code?: string; status?: number }
type SaveListingResult = { success: true; listingId: string } | ActionFailure
type SaveDraftResult = { success: true; draftId: string } | ActionFailure
type UpdateListingResult = { success: true } | ActionFailure

// Thrown inside a $transaction to abort with a specific user-facing message
// while still rolling back — caught once, right below the transaction call.
class DraftNotFoundError extends Error {}
class ListingRevisionError extends Error {}

// Authenticated local-file adapters scope uploads to the actor's folder. This
// additional check rejects references to another member's stored objects.
function ownsPaths(userId: string, paths: (string | undefined | null)[]): boolean {
  const ownedPrefix = `${userId}/`
  return paths
    .filter((path): path is string => Boolean(path))
    .every((path) => path.startsWith(ownedPrefix) && !path.includes('..'))
}

async function setListingCapture(
  tx: Prisma.TransactionClient,
  listingId: string,
  capture: { id: string; start_geometry: Prisma.JsonValue }
) {
  await tx.listingLocation.upsert({ where: { listing_id: listingId },
    create: { id: listingId, listing_id: listingId, geometry: capture.start_geometry as Prisma.InputJsonValue, capture_id: capture.id },
    update: { geometry: capture.start_geometry as Prisma.InputJsonValue, capture_id: capture.id } })
}

async function resolveCaptureAddress(userId: string, captureId: string, videoPath: string, address: string) {
  const capture = await readCaptureForSubmission(userId, captureId, videoPath)
  let resolved: Awaited<ReturnType<typeof geocodeListingAddress>>
  try { resolved = await geocodeListingAddress(address) } catch { resolved = null }
  const point = decodeGeographicPoint(capture.start_geometry)
  if (!resolved || !point) throw new ApiError(503, 'ADDRESS_UNAVAILABLE', 'The address could not be verified precisely. Check the full building address or try again when address verification is available. Your draft can still be saved.')
  const distance = distanceMetersWgs84(point, resolved)
  if (distance > SPATIAL_TOLERANCE_METERS) throw new ApiError(409, 'ADDRESS_MISMATCH', 'The entered address does not match the location locked when this walkthrough was recorded. Correct the address or record a new take at the asset.')
  return { capture, distance, hash: addressFingerprint(address) }
}

async function recordAddressMatch(tx: Prisma.TransactionClient, listingId: string, captureId: string, match: { distance: number; hash: string }) {
  await tx.listingVerification.upsert({ where: { listing_id: listingId }, create: { listing_id: listingId, capture_id: captureId, address_hash: match.hash, spatial_status: 'matched', distance_meters: match.distance },
    update: { capture_id: captureId, address_hash: match.hash, spatial_status: 'matched', distance_meters: match.distance, checked_at: new Date() } })
}

// These services receive the actor only from trusted cookie/bearer adapters.
// They are never exported as client-invokable Server Actions.
export async function saveListingForUser(userId: string, input: unknown): Promise<SaveListingResult> {
  let committedListingId: string | null = null
  let command: MutationCommand | null = null
  try {
    const parsed = saveListingInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'Some listing details are invalid. Go back and check each step.' }
    }
    command = mutationCommand(userId, 'listing_submit', parsed.data.clientId, parsed.data)
    const alreadySaved = await committedMutation(command)
    if (alreadySaved) return { success: true, listingId: alreadySaved }
    const { category, address, basePrice, draftId, captureId, videoPath, posterPath, documentPath } =
      parsed.data
    const isGallery = parsed.data.mediaSource === 'approved_gallery'
    if (!isGallery && (!captureId || !videoPath)) throw new ApiError(409, 'CAPTURE_REQUIRED', 'Record and upload a walkthrough with its location before submitting.')
    if (videoPath && muxEnabled() && !muxConfigured()) return { success: false, error: 'Video processing is temporarily unavailable. Save your draft and try again later.' }

    const metadata = METADATA_SCHEMAS[category].safeParse(parsed.data.metadata)
    if (!metadata.success) {
      return { success: false, error: 'Asset details are incomplete. Go back and check the details step.' }
    }

    if (!ownsPaths(userId, [videoPath, documentPath, posterPath, ...(parsed.data.galleryPhotos ?? [])])) {
      return { success: false, error: 'Uploaded files could not be verified. Please try again.' }
    }

    const observedDraft = draftId ? await prisma.listing.findFirst({ where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT }, select: { id: true, revision: true } }) : null
    if (draftId && !observedDraft) throw new DraftNotFoundError()
    if (observedDraft && parsed.data.expectedRevision !== undefined && observedDraft.revision !== parsed.data.expectedRevision) throw new ListingRevisionError()

    // Only server-sealed recording evidence can supply this point. Geocoder I/O
    // precedes the transaction; exact capture/video binding is checked again in it.
    const galleryRevision = isGallery ? await withTransaction(tx => assertGalleryPermission(tx, userId)) : null
    const addressMatch = !isGallery && captureId && videoPath ? await resolveCaptureAddress(userId, captureId, videoPath, address) : null
    const gallery = isGallery ? await prepareGalleryMedia(userId, { galleryPhotos: parsed.data.galleryPhotos, videoPath, posterPath, documentPath }) : null
    const storedObjects = gallery?.objects ?? await prepareListingStorage(userId, { videoPath, posterPath, documentPath })
    const storedVideo = storedObjects.find(object => object.path === videoPath)
    if (!isGallery && !storedVideo) throw new ApiError(409, 'CAPTURE_REQUIRED', 'Upload and seal the walkthrough before submitting it.')

    const listingData = {
      category,
      text_address: address,
      base_rent_amount: Number(basePrice),
      asset_metadata: metadata.data,
      video_path: videoPath ?? null,
      poster_path: gallery?.posterPath ?? posterPath ?? null,
      document_path: documentPath,
      capture_id: isGallery ? null : captureId,
      media_source: isGallery ? 'approved_gallery' : 'recorded',
      gallery_media: gallery?.proof ?? [], gallery_media_paths: gallery?.paths ?? [], gallery_permission_revision: galleryRevision,
      wizard_step: null,
    }

    // The validated listing and its private location commit atomically before
    // the draft becomes a review submission. Mongo has no SQL CHECK constraint.
    const result = await withTransaction(async (tx) => {
      await assertActiveAccounts(tx, [userId])
      const replay = await transactionMutation(tx, command)
      if (replay) return { row: await tx.listing.findFirstOrThrow({ where: { id: replay, lister_id: userId }, select: { id: true, lister: { select: { username: true } } } }), replayed: true }
      if (isGallery) await assertGalleryPermission(tx, userId, galleryRevision!)
      if (draftId) {
        // Serialize draft publication with edits so ownership, status, footage
        // and its stored GPS are checked against the exact row being published.
        const owned = await tx.listing.findFirst({ where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT }, select: { id: true, revision: true } })
        if (owned && owned.revision !== observedDraft?.revision) throw new ListingRevisionError()
        if (!owned || !await lockRecord(tx, 'listing', draftId)) throw new DraftNotFoundError()
        const current = await tx.listing.findFirst({ where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT }, select: { video_path: true } })
        if (!current) throw new DraftNotFoundError()
      }
      await claimStorageObjects(tx, userId, storedObjects)
      const row = draftId
        ? await tx.listing.update({
            where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
            data: listingData,
            select: { id: true, lister: { select: { username: true } } },
          })
        : await tx.listing.create({
            data: { ...listingData, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
            select: { id: true, lister: { select: { username: true } } },
          })

      if (isGallery) await tx.listingLocation.deleteMany({ where: { listing_id: row.id } })
      else if (captureId && storedVideo && addressMatch) {
        const capture = await bindCaptureToListing(tx, userId, captureId, row.id, storedVideo)
        if (capture.begin_hash !== addressMatch.capture.begin_hash || capture.video_digest !== addressMatch.capture.video_digest) throw new ListingRevisionError()
        await setListingCapture(tx, row.id, capture)
        await recordAddressMatch(tx, row.id, captureId, addressMatch)
      } else throw new ApiError(409, 'CAPTURE_REQUIRED', 'Confirm this recording and its location before submitting.')

      await tx.listing.update({
        where: { id: row.id },
        data: { listing_status: LISTING_STATUS.PENDING_VERIFICATION },
      })
      if (videoPath && muxEnabled()) {
        await tx.mediaAsset.create({ data: { listing_id: row.id, source_path: videoPath, mux_asset_id: null, playback_id: null } })
      }
      await applySubmissionPublishing(tx, userId, row.id, storedObjects)
      await recordMutation(tx, command, row.id)
      return { row, replayed: false }
    })
    const listing = result.row
    committedListingId = listing.id
    if (result.replayed) return { success: true, listingId: listing.id }

    revalidatePath('/marketplace')
    revalidatePath('/marketplace/listing')
    revalidateProfilePaths(listing.lister.username)

    after(() =>
      captureServerEvent(userId, 'listing_created', {
        category,
        ...(addressMatch ? { gps_accuracy_meters: addressMatch.capture.start_accuracy } : { media_source: 'approved_gallery' }),
        from_draft: Boolean(draftId),
      })
    )
    if (videoPath && muxEnabled()) after(async () => {
      try {
        await processListingMedia(listing.id, userId)
      } catch {
        console.warn('[media] Dispatch interrupted; inspect the persisted job before retrying.')
      }
    })

    return { success: true, listingId: listing.id }
  } catch (error) {
    if (error instanceof ApiError) return { success: false, code: error.code, status: error.status, error: error.message }
    if (error instanceof AccountUnavailableError) return { success: false, code: 'ACCOUNT_UNAVAILABLE', error: error.message }
    if (error instanceof MutationConflictError) return { success: false, code: 'INVALID_RETRY', error: error.message }
    if (error instanceof ListingRevisionError) return { success: false, code: 'STALE_LISTING', error: 'This listing changed on another screen. Reload it before saving your changes.' }
    if (command) {
      try {
        const saved = await committedMutation(command)
        if (saved) return { success: true, listingId: saved }
      } catch (recovery) { if (recovery instanceof MutationConflictError) return { success: false, code: 'INVALID_RETRY', error: recovery.message } }
    }
    if (committedListingId) {
      console.warn('[listings] Listing saved; post-commit refresh or dispatch failed.')
      return { success: true, listingId: committedListingId }
    }
    if (error instanceof DraftNotFoundError) return { success: false, error: 'Draft not found or already submitted.' }
    if (error instanceof StorageError && error.status < 500) return { success: false, error: error.message }
    console.error('[listings] Submission failed:', error instanceof Error ? error.name : 'UnknownError')
    return { success: false, uncertain: true, error: 'The save could not be confirmed. Check Your Listings before submitting again.' }
  }
}

export async function saveDraftForUser(userId: string, input: unknown): Promise<SaveDraftResult> {
  let committedDraftId: string | null = null
  let command: MutationCommand | null = null
  try {
    const parsed = saveDraftInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'This draft could not be saved. Please try again.' }
    }
    command = mutationCommand(userId, 'listing_draft_save', parsed.data.clientId, parsed.data)
    const alreadySaved = await committedMutation(command)
    if (alreadySaved) return { success: true, draftId: alreadySaved }
    const { draftId, category, wizardStep, address, basePrice, captureId, videoPath, posterPath, documentPath } =
      parsed.data
    const isGallery = parsed.data.mediaSource === 'approved_gallery'

    if (!ownsPaths(userId, [videoPath, posterPath, documentPath, ...(parsed.data.galleryPhotos ?? [])])) {
      return { success: false, error: 'Uploaded files could not be verified. Please try again.' }
    }
    if (captureId && !videoPath) throw new ApiError(400, 'CAPTURE_REQUIRED', 'Attach the uploaded walkthrough belonging to this recording before saving its lock.')
    const galleryRevision = isGallery ? await withTransaction(tx => assertGalleryPermission(tx, userId)) : null
    const gallery = isGallery ? await prepareGalleryMedia(userId, { galleryPhotos: parsed.data.galleryPhotos, videoPath, posterPath, documentPath }) : null
    const storedObjects = gallery?.objects ?? await prepareListingStorage(userId, { videoPath, posterPath, documentPath })

    // Whole-naira prices of at most ten digits are exact IEEE-754 integers.
    const priceForDb = basePrice && /^[1-9][0-9]{0,9}$/.test(basePrice) ? Number(basePrice) : null

    const draftData = {
      category,
      wizard_step: wizardStep,
      text_address: address || null,
      base_rent_amount: priceForDb,
      asset_metadata: (parsed.data.metadata ?? {}) as Prisma.InputJsonValue,
      video_path: videoPath ?? null,
      poster_path: gallery?.posterPath ?? posterPath ?? null,
      document_path: documentPath ?? null,
      capture_id: isGallery ? null : captureId ?? null,
      media_source: isGallery ? 'approved_gallery' : 'recorded',
      gallery_media: gallery?.proof ?? [], gallery_media_paths: gallery?.paths ?? [], gallery_permission_revision: galleryRevision,
    }

    const row = await withTransaction(async (tx) => {
      await assertActiveAccounts(tx, [userId])
      const replay = await transactionMutation(tx, command)
      if (replay) return { id: replay, replayed: true }
      if (isGallery) await assertGalleryPermission(tx, userId, galleryRevision!)
      let id = draftId
      let videoChanged = false

      if (draftId) {
        // Read the current video_path before overwriting it — needed to tell
        // whether this save is swapping in different footage, in which case
        // any inherited coordinates would no longer describe what's stored.
        const owned = await tx.listing.findFirst({ where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT }, select: { id: true, revision: true } })
        if (owned && parsed.data.expectedRevision !== undefined && owned.revision !== parsed.data.expectedRevision) throw new ListingRevisionError()
        if (!owned || !await lockRecord(tx, 'listing', draftId)) throw new DraftNotFoundError()
        const existing = await tx.listing.findFirst({
          where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
          select: { video_path: true },
        })
        if (!existing) throw new DraftNotFoundError()
        videoChanged = (videoPath ?? null) !== existing.video_path
        await claimStorageObjects(tx, userId, storedObjects)

        const result = await tx.listing.updateMany({
          where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
          data: draftData,
        })
        if (result.count === 0) throw new DraftNotFoundError()
      } else {
        await claimStorageObjects(tx, userId, storedObjects)
        const created = await tx.listing.create({
          data: { ...draftData, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
          select: { id: true },
        })
        id = created.id
      }

      if (!id) throw new DraftNotFoundError()
      if (isGallery) await tx.listingLocation.deleteMany({ where: { listing_id: id } })
      else if (captureId && videoPath) {
        const video = storedObjects.find(object => object.path === videoPath)
        if (!video) throw new ApiError(409, 'CAPTURE_REQUIRED', 'Upload and seal the walkthrough before saving it.')
        const capture = await bindCaptureToListing(tx, userId, captureId, id, video)
        await setListingCapture(tx, id, capture)
      } else if (videoChanged) {
        // The video changed with no fresh GPS fix in this call — clear any
        // coordinates inherited from the previous take so a later saveListing
        // call can't post this draft while attributing stale coordinates to
        // footage they were never recorded against.
        await tx.listingLocation.deleteMany({ where: { listing_id: id } })
      }
      await recordMutation(tx, command, id)
      return { id, replayed: false }
    })
    committedDraftId = row.id
    if (row.replayed) return { success: true, draftId: row.id }

    revalidatePath('/marketplace/listing')

    after(() => captureServerEvent(userId, 'listing_draft_saved', { category, step: wizardStep }))

    return { success: true, draftId: row.id }
  } catch (error) {
    if (error instanceof ApiError) return { success: false, code: error.code, status: error.status, error: error.message }
    if (error instanceof AccountUnavailableError) return { success: false, code: 'ACCOUNT_UNAVAILABLE', error: error.message }
    if (error instanceof MutationConflictError) return { success: false, code: 'INVALID_RETRY', error: error.message }
    if (error instanceof ListingRevisionError) return { success: false, code: 'STALE_LISTING', error: 'This draft changed on another screen. Reload it before saving your changes.' }
    if (command) {
      try {
        const saved = await committedMutation(command)
        if (saved) return { success: true, draftId: saved }
      } catch (recovery) { if (recovery instanceof MutationConflictError) return { success: false, code: 'INVALID_RETRY', error: recovery.message } }
    }
    if (committedDraftId) {
      console.warn('[listings] Draft saved; post-commit refresh failed.')
      return { success: true, draftId: committedDraftId }
    }
    if (error instanceof DraftNotFoundError) {
      return { success: false, error: 'Draft not found.' }
    }
    if (error instanceof StorageError && error.status < 500) return { success: false, error: error.message }
    console.error('[listings] Draft save failed:', error instanceof Error ? error.name : 'UnknownError')
    return { success: false, uncertain: true, error: 'The save could not be confirmed. Check Your Listings before saving again.' }
  }
}

/** Reversible owner archive; every existing booking, receipt and file is retained. */
export async function setListingArchivedForUser(userId: string, listingId: string, archived: boolean): Promise<UpdateListingResult> {
  if (!z.uuid().safeParse(listingId).success || typeof archived !== 'boolean') return { success: false, error: 'Choose a valid listing.' }
  let committed = false
  try {
    await withTransaction(async tx => {
      await assertActiveAccounts(tx, [userId])
      const owned = await tx.listing.findFirst({ where: { id: listingId, lister_id: userId }, select: { id: true } })
      if (!owned || !await lockRecord(tx, 'listing', listingId)) throw new DraftNotFoundError()
      const listing = await tx.listing.findFirst({ where: { id: listingId, lister_id: userId }, select: { listing_status: true, archived_at: true, archived_status: true } })
      if (!listing) throw new DraftNotFoundError()
      if (Boolean(listing.archived_at) === archived) return
      if (archived) {
        await expireListingReservations(tx, listingId, new Date())
        const current = await tx.booking.findFirst({ where: { listing_id: listingId, status: { in: ['requested', 'awaiting_payment', 'confirmed', 'disputed'] } }, select: { id: true } })
        if (current) throw new Error('ACTIVE_BOOKING')
        await tx.listing.update({ where: { id: listingId }, data: { archived_at: new Date(), archived_status: listing.listing_status, listing_status: 'suspended' } })
      } else {
        await tx.listing.update({ where: { id: listingId }, data: { archived_at: null, archived_status: null,
          listing_status: listing.archived_status === LISTING_STATUS.DRAFT ? LISTING_STATUS.DRAFT : LISTING_STATUS.PENDING_VERIFICATION } })
      }
    })
    committed = true
    revalidatePath('/marketplace'); revalidatePath('/marketplace/listing'); revalidatePath(`/marketplace/listing/${listingId}`)
    return { success: true }
  } catch (error) {
    if (committed) return { success: true }
    if (error instanceof AccountUnavailableError) return { success: false, code: 'ACCOUNT_UNAVAILABLE', error: error.message }
    if (error instanceof DraftNotFoundError) return { success: false, error: 'Listing not found.' }
    if (error instanceof Error && error.message === 'ACTIVE_BOOKING') return { success: false, error: 'Finish or cancel outstanding bookings and reports before archiving this listing.' }
    return { success: false, uncertain: true, error: 'The archive change could not be confirmed. Refresh your listings before trying again.' }
  }
}

export async function updateListingForUser(userId: string, input: unknown): Promise<UpdateListingResult> {
  let committed = false
  try {
    const parsed = updateListingInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'Some listing details are invalid. Check each field.' }
    }
    const { listingId, address, basePrice } = parsed.data

    const row = await prisma.listing.findFirst({
      where: { id: listingId, lister_id: userId },
      select: { id: true, revision: true, category: true, listing_status: true, archived_at: true, text_address: true, capture_id: true, video_path: true, media_source: true, gallery_permission_revision: true, lister: { select: { username: true } } },
    })
    if (!row) {
      return { success: false, error: 'Listing not found.' }
    }
    if (row.archived_at) return { success: false, error: 'Restore this listing before editing it.' }
    if (row.listing_status === LISTING_STATUS.DRAFT) {
      return { success: false, error: 'Drafts are edited from the listing wizard.' }
    }
    if (parsed.data.expectedRevision !== undefined && row.revision !== parsed.data.expectedRevision) throw new ListingRevisionError()

    const categorySchema = METADATA_SCHEMAS[row.category as keyof typeof METADATA_SCHEMAS]
    const metadata = categorySchema?.safeParse(parsed.data.metadata)
    if (!metadata?.success) {
      return { success: false, error: 'Asset details are incomplete. Check each field.' }
    }
    const isGallery = row.media_source === 'approved_gallery'
    const addressEdited = addressFingerprint(row.text_address ?? '') !== addressFingerprint(address)
    const addressMatch = !isGallery && addressEdited
      ? await resolveCaptureAddress(userId, row.capture_id ?? '', row.video_path ?? '', address) : null

    // Category, video, GPS, and documents are padlocked (Item 11) — only the
    // describable attributes are editable.
    await withTransaction(async tx => {
      await assertActiveAccounts(tx, [userId])
      if (parsed.data.expectedRevision !== undefined || addressMatch || isGallery && addressEdited) {
        const version = await tx.listing.findFirst({ where: { id: row.id, lister_id: userId }, select: { revision: true } })
        if (!version || version.revision !== row.revision) throw new ListingRevisionError()
      }
      if (!await lockRecord(tx, 'listing', row.id)) throw new Error('Listing is no longer editable.')
      const current = await tx.listing.findFirst({ where: { id: row.id, lister_id: userId, listing_status: { not: LISTING_STATUS.DRAFT } },
        select: { text_address: true, archived_at: true, capture_id: true, video_path: true, media_source: true, gallery_permission_revision: true } })
      if (!current || current.archived_at) throw new Error('Listing is no longer editable.')
      if ((current.media_source ?? 'recorded') !== (row.media_source ?? 'recorded')) throw new ListingRevisionError()
      const galleryRevision = isGallery ? await assertGalleryPermission(tx, userId) : null
      const galleryReapproval = isGallery && current.gallery_permission_revision !== galleryRevision
      const addressChanged = addressFingerprint(current.text_address ?? '') !== addressFingerprint(address)
      if (!isGallery && addressChanged && (!addressMatch || current.capture_id !== addressMatch.capture.id || current.video_path !== addressMatch.capture.video_path)) throw new ListingRevisionError()
      if (addressChanged && platformEnabled()) {
        const reservations = await tx.booking.count({ where: { listing_id: row.id, status: { in: ['confirmed', 'completed', 'disputed'] } } })
        if (reservations) throw new Error('Address changes are unavailable after a confirmed booking.')
      }
      if ((addressChanged || galleryReapproval) && platformEnabled()) await tx.documentReview.updateMany({ where: { listing_id: row.id }, data: { status: 'needs_review', reviewed_by: null } })
      await tx.listing.update({
        where: { id: row.id, lister_id: userId },
        data: {
          text_address: address, base_rent_amount: Number(basePrice), asset_metadata: metadata.data,
          // A changed address cannot retain an earlier spatial/document approval.
          ...(addressChanged || galleryReapproval ? { listing_status: LISTING_STATUS.PENDING_VERIFICATION } : {}),
          ...(isGallery ? { gallery_permission_revision: galleryRevision } : {}),
        },
      })
      if (addressChanged && addressMatch) await recordAddressMatch(tx, row.id, addressMatch.capture.id, addressMatch)
    })

    committed = true
    revalidatePath('/marketplace')
    revalidatePath('/marketplace/listing')
    revalidatePath(`/marketplace/listing/${row.id}`)
    revalidateProfilePaths(row.lister.username)

    after(() => captureServerEvent(userId, 'listing_updated', { category: row.category }))

    return { success: true }
  } catch (error) {
    if (committed) return { success: true }
    if (error instanceof ApiError) return { success: false, code: error.code, status: error.status, error: error.message }
    if (error instanceof AccountUnavailableError) return { success: false, code: 'ACCOUNT_UNAVAILABLE', error: error.message }
    if (error instanceof ListingRevisionError) return { success: false, code: 'STALE_LISTING', error: 'This listing changed on another screen. Reload it before saving your changes.' }
    console.error('[listings] Update failed:', error instanceof Error ? error.name : 'UnknownError')
    if (error instanceof Error && error.message === 'Address changes are unavailable after a confirmed booking.') {
      return { success: false, error: 'This asset already has a confirmed booking. Its address cannot be changed.' }
    }
    if (error instanceof Error && error.message === 'Listing is no longer editable.') return { success: false, code: 'STALE_LISTING', error: 'This listing is no longer editable. Reload it before continuing.' }
    return { success: false, uncertain: true, error: 'The update could not be confirmed. Reload this listing before saving again.' }
  }
}

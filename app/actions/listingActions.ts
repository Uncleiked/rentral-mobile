'use server'

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
import { requireVerifiedUserId, revalidateProfilePaths } from '@/lib/action-helpers'
import { LISTING_STATUS } from '@/lib/listing-status'
import { captureServerEvent } from '@/lib/posthog'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { processListingMedia } from '@/lib/media/processing'
import { platformEnabled } from '@/lib/platform'
import { addressFingerprint } from '@/lib/listings/spatial'

const METADATA_SCHEMAS = {
  house: houseMetadataSchema,
  car: carMetadataSchema,
  boat: boatMetadataSchema,
} as const

type ActionFailure = { success: false; error: string }
type SaveListingResult = { success: true; listingId: string } | ActionFailure
type SaveDraftResult = { success: true; draftId: string } | ActionFailure
type UpdateListingResult = { success: true } | ActionFailure

// Thrown inside a $transaction to abort with a specific user-facing message
// while still rolling back — caught once, right below the transaction call.
class DraftNotFoundError extends Error {}
class MissingCoordinatesError extends Error {}

// The client uploaded these objects itself; storage RLS scopes writes to the
// uploader's folder, and this check stops a caller from pointing a listing at
// someone else's objects.
function ownsPaths(userId: string, paths: (string | undefined | null)[]): boolean {
  const ownedPrefix = `${userId}/`
  return paths
    .filter((path): path is string => Boolean(path))
    .every((path) => path.startsWith(ownedPrefix) && !path.includes('..'))
}

async function setListingCoordinates(
  tx: Prisma.TransactionClient,
  listingId: string,
  lng: number,
  lat: number
) {
  await tx.$executeRaw`
    UPDATE "Listing"
    SET "hardware_coordinates" = extensions.ST_SetSRID(extensions.ST_MakePoint(${lng}, ${lat}), 4326)::extensions.geography
    WHERE "id" = ${listingId}
  `
}

export async function saveListing(input: unknown): Promise<SaveListingResult> {
  let committedListingId: string | null = null
  try {
    if (muxEnabled() && !muxConfigured()) {
      return { success: false, error: 'Video processing is temporarily unavailable. Save your draft and try again later.' }
    }
    const userId = await requireVerifiedUserId()
    if (!userId) {
      return { success: false, error: 'Sign in and complete identity verification to manage listings.' }
    }

    const parsed = saveListingInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'Some listing details are invalid. Go back and check each step.' }
    }
    const { category, address, basePrice, draftId, lat, lng, accuracy, videoPath, posterPath, documentPath } =
      parsed.data

    const metadata = METADATA_SCHEMAS[category].safeParse(parsed.data.metadata)
    if (!metadata.success) {
      return { success: false, error: 'Asset details are incomplete. Go back and check the details step.' }
    }

    if (!ownsPaths(userId, [videoPath, documentPath, posterPath])) {
      return { success: false, error: 'Uploaded files could not be verified. Please try again.' }
    }

    // Coordinates come either from a fresh recording in this session, or from
    // the draft row where an earlier session stored them (they never round-trip
    // through the client — spatial privacy invariant). Stored coordinates are
    // only trusted when video_path is UNCHANGED from what they were recorded
    // against — otherwise a caller could swap in unrelated footage while
    // riding an earlier take's GPS lock, defeating the spatial-integrity gate.
    const hasFreshCoords = lat !== undefined && lng !== undefined
    if (!hasFreshCoords && !draftId) {
      return { success: false, error: 'Your walkthrough is missing its GPS lock. Go back and re-record it.' }
    }

    const listingData = {
      category,
      text_address: address,
      base_rent_amount: basePrice,
      asset_metadata: metadata.data,
      video_path: videoPath,
      poster_path: posterPath ?? null,
      document_path: documentPath,
      wizard_step: null,
    }

    // The completeness CHECK only applies to non-draft statuses, so the row is
    // written (still 'draft'), coordinates set, and the status flipped last —
    // the constraint holds after every statement and a listing can never be
    // posted incomplete.
    const listing = await prisma.$transaction(async (tx) => {
      if (draftId) {
        // Serialize draft publication with edits so ownership, status, footage
        // and its stored GPS are checked against the exact row being published.
        const rows = await tx.$queryRaw<{ has_coords: boolean; video_path: string | null }[]>`
          SELECT ("hardware_coordinates" IS NOT NULL) AS has_coords, "video_path"
          FROM "Listing"
          WHERE "id" = ${draftId} AND "lister_id" = ${userId} AND "listing_status" = ${LISTING_STATUS.DRAFT}
          FOR UPDATE
        `
        if (!rows[0]) throw new DraftNotFoundError()
        if (!hasFreshCoords && (!rows[0].has_coords || rows[0].video_path !== videoPath)) {
          throw new MissingCoordinatesError()
        }
      }
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

      if (hasFreshCoords) {
        await setListingCoordinates(tx, row.id, lng, lat)
      }

      await tx.listing.update({
        where: { id: row.id },
        data: { listing_status: LISTING_STATUS.PENDING_VERIFICATION },
      })
      if (muxEnabled()) {
        await tx.mediaAsset.create({ data: { listing_id: row.id, source_path: videoPath } })
      }
      return row
    })
    committedListingId = listing.id

    revalidatePath('/marketplace')
    revalidatePath('/marketplace/listing')
    revalidateProfilePaths(listing.lister.username)

    after(() =>
      captureServerEvent(userId, 'listing_created', {
        category,
        gps_accuracy_meters: accuracy,
        from_draft: Boolean(draftId),
      })
    )
    if (muxEnabled()) after(async () => {
      try {
        await processListingMedia(listing.id, userId)
      } catch {
        console.warn('[media] Dispatch interrupted; inspect the persisted job before retrying.')
      }
    })

    return { success: true, listingId: listing.id }
  } catch (error) {
    if (committedListingId) {
      console.warn('[listings] Listing saved; post-commit refresh or dispatch failed.')
      return { success: true, listingId: committedListingId }
    }
    if (error instanceof DraftNotFoundError) return { success: false, error: 'Draft not found or already submitted.' }
    if (error instanceof MissingCoordinatesError) {
      return { success: false, error: 'Your walkthrough is missing its GPS lock. Go back and re-record it.' }
    }
    console.error('[actions/listingActions] saveListing failed:', error)
    return { success: false, error: 'We could not save your listing. Please try again.' }
  }
}

export async function saveDraft(input: unknown): Promise<SaveDraftResult> {
  let committedDraftId: string | null = null
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) {
      return { success: false, error: 'Sign in and complete identity verification to manage listings.' }
    }

    const parsed = saveDraftInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'This draft could not be saved. Please try again.' }
    }
    const { draftId, category, wizardStep, address, basePrice, lat, lng, videoPath, posterPath, documentPath } =
      parsed.data

    if (!ownsPaths(userId, [videoPath, posterPath, documentPath])) {
      return { success: false, error: 'Uploaded files could not be verified. Please try again.' }
    }

    // Drafts tolerate anything except a value the Decimal column would reject.
    const priceForDb = basePrice && /^[1-9][0-9]{0,9}$/.test(basePrice) ? basePrice : null

    const draftData = {
      category,
      wizard_step: wizardStep,
      text_address: address || null,
      base_rent_amount: priceForDb,
      asset_metadata: (parsed.data.metadata ?? {}) as Prisma.InputJsonValue,
      video_path: videoPath ?? null,
      poster_path: posterPath ?? null,
      document_path: documentPath ?? null,
    }

    const hasFreshCoords = lat !== undefined && lng !== undefined

    const row = await prisma.$transaction(async (tx) => {
      let id = draftId
      let videoChanged = false

      if (draftId) {
        // Read the current video_path before overwriting it — needed to tell
        // whether this save is swapping in different footage, in which case
        // any inherited coordinates would no longer describe what's stored.
        const existing = await tx.listing.findFirst({
          where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
          select: { video_path: true },
        })
        if (!existing) throw new DraftNotFoundError()
        videoChanged = videoPath !== undefined && videoPath !== existing.video_path

        const result = await tx.listing.updateMany({
          where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
          data: draftData,
        })
        if (result.count === 0) throw new DraftNotFoundError()
      } else {
        const created = await tx.listing.create({
          data: { ...draftData, lister_id: userId, listing_status: LISTING_STATUS.DRAFT },
          select: { id: true },
        })
        id = created.id
      }

      if (hasFreshCoords) {
        await setListingCoordinates(tx, id!, lng, lat)
      } else if (videoChanged) {
        // The video changed with no fresh GPS fix in this call — clear any
        // coordinates inherited from the previous take so a later saveListing
        // call can't post this draft while attributing stale coordinates to
        // footage they were never recorded against.
        await tx.$executeRaw`UPDATE "Listing" SET "hardware_coordinates" = NULL WHERE "id" = ${id!}`
      }
      return { id: id! }
    })
    committedDraftId = row.id

    revalidatePath('/marketplace/listing')

    after(() => captureServerEvent(userId, 'listing_draft_saved', { category, step: wizardStep }))

    return { success: true, draftId: row.id }
  } catch (error) {
    if (committedDraftId) {
      console.warn('[listings] Draft saved; post-commit refresh failed.')
      return { success: true, draftId: committedDraftId }
    }
    if (error instanceof DraftNotFoundError) {
      return { success: false, error: 'Draft not found.' }
    }
    console.error('[actions/listingActions] saveDraft failed:', error)
    return { success: false, error: 'We could not save your draft. Please try again.' }
  }
}

export async function updateListing(input: unknown): Promise<UpdateListingResult> {
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) {
      return { success: false, error: 'Sign in and complete identity verification to manage listings.' }
    }

    const parsed = updateListingInputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'Some listing details are invalid. Check each field.' }
    }
    const { listingId, address, basePrice } = parsed.data

    const row = await prisma.listing.findFirst({
      where: { id: listingId, lister_id: userId },
      select: { id: true, category: true, listing_status: true, lister: { select: { username: true } } },
    })
    if (!row) {
      return { success: false, error: 'Listing not found.' }
    }
    if (row.listing_status === LISTING_STATUS.DRAFT) {
      return { success: false, error: 'Drafts are edited from the listing wizard.' }
    }

    const categorySchema = METADATA_SCHEMAS[row.category as keyof typeof METADATA_SCHEMAS]
    const metadata = categorySchema?.safeParse(parsed.data.metadata)
    if (!metadata?.success) {
      return { success: false, error: 'Asset details are incomplete. Check each field.' }
    }

    // Category, video, GPS, and documents are padlocked (Item 11) — only the
    // describable attributes are editable.
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE id=${row.id} AND lister_id=${userId} FOR UPDATE`
      const current = await tx.listing.findFirst({ where: { id: row.id, lister_id: userId, listing_status: { not: LISTING_STATUS.DRAFT } },
        select: { text_address: true } })
      if (!current) throw new Error('Listing is no longer editable.')
      const addressChanged = addressFingerprint(current.text_address ?? '') !== addressFingerprint(address)
      if (addressChanged && platformEnabled()) {
        const reservations = await tx.booking.count({ where: { listing_id: row.id, status: { in: ['confirmed', 'completed', 'disputed'] } } })
        if (reservations) throw new Error('Address changes are unavailable after a confirmed booking.')
        await tx.documentReview.updateMany({ where: { listing_id: row.id }, data: { status: 'needs_review', reviewed_by: null } })
      }
      await tx.listing.update({
        where: { id: row.id, lister_id: userId },
        data: {
          text_address: address, base_rent_amount: basePrice, asset_metadata: metadata.data,
          // A changed address cannot retain an earlier spatial/document approval.
          ...(addressChanged ? { listing_status: LISTING_STATUS.PENDING_VERIFICATION } : {}),
        },
      })
    })

    revalidatePath('/marketplace')
    revalidatePath('/marketplace/listing')
    revalidatePath(`/marketplace/listing/${row.id}`)
    revalidateProfilePaths(row.lister.username)

    after(() => captureServerEvent(userId, 'listing_updated', { category: row.category }))

    return { success: true }
  } catch (error) {
    console.error('[actions/listingActions] updateListing failed:', error)
    if (error instanceof Error && error.message === 'Address changes are unavailable after a confirmed booking.') {
      return { success: false, error: 'This asset already has a confirmed booking. Its address cannot be changed.' }
    }
    return { success: false, error: 'We could not update your listing. Please try again.' }
  }
}

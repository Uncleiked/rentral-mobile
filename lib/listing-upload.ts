import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/client'
import { COMPLIANCE_DOCS_BUCKET, LISTINGS_MEDIA_BUCKET, videoExtensionForMime } from '@/lib/storage'

// Client-side upload orchestration shared by "Save Draft" and the final post.
// Local blobs win over already-uploaded draft media; filenames are timestamped
// so a retake never collides with the INSERT-only storage policy. Replaced
// draft objects are left behind for now (GC is a flagged follow-up).

export type ListingMediaSnapshot = {
  videoBlob: Blob | null
  videoMimeType: string | null
  posterBlob: Blob | null
  documentFile: File | null
  remoteVideoPath: string | null
  remotePosterPath: string | null
  remoteDocumentPath: string | null
}

export type UploadedListingMedia = {
  videoPath: string | null
  posterPath: string | null
  documentPath: string | null
  // Objects uploaded by THIS call — the caller removes them if the follow-up
  // server action fails, so failed saves don't strand storage objects.
  newUploads: { bucket: string; path: string }[]
}

export async function removeUploads(supabase: SupabaseClient, uploads: { bucket: string; path: string }[]) {
  await Promise.allSettled(
    uploads.map(({ bucket, path }) => supabase.storage.from(bucket).remove([path]))
  )
}

export async function uploadListingMedia(
  supabase: SupabaseClient,
  uid: string,
  folderId: string,
  media: ListingMediaSnapshot
): Promise<UploadedListingMedia> {
  const newUploads: { bucket: string; path: string }[] = []
  const stamp = Date.now()

  const pending: Promise<{ error: unknown } | { error: null }>[] = []

  let videoPath = media.remoteVideoPath
  if (media.videoBlob && media.videoMimeType) {
    videoPath = `${uid}/${folderId}/${stamp}_video.${videoExtensionForMime(media.videoMimeType)}`
    newUploads.push({ bucket: LISTINGS_MEDIA_BUCKET, path: videoPath })
    pending.push(
      supabase.storage
        .from(LISTINGS_MEDIA_BUCKET)
        .upload(videoPath, media.videoBlob, { contentType: media.videoMimeType, cacheControl: '3600' })
    )
  }

  let posterPath = media.remotePosterPath
  if (media.posterBlob) {
    posterPath = `${uid}/${folderId}/${stamp}_poster.jpg`
    newUploads.push({ bucket: LISTINGS_MEDIA_BUCKET, path: posterPath })
    pending.push(
      supabase.storage
        .from(LISTINGS_MEDIA_BUCKET)
        .upload(posterPath, media.posterBlob, { contentType: 'image/jpeg', cacheControl: '3600' })
    )
  }

  let documentPath = media.remoteDocumentPath
  if (media.documentFile) {
    const safeName = media.documentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    documentPath = `${uid}/${folderId}/${stamp}_${safeName}`
    newUploads.push({ bucket: COMPLIANCE_DOCS_BUCKET, path: documentPath })
    pending.push(
      supabase.storage
        .from(COMPLIANCE_DOCS_BUCKET)
        .upload(documentPath, media.documentFile, {
          contentType: media.documentFile.type,
          cacheControl: '3600',
        })
    )
  }

  const results = await Promise.allSettled(pending)
  if (results.some((result) => result.status === 'rejected' || result.value.error)) {
    await removeUploads(supabase, newUploads)
    throw new Error('listing-media-upload-failed')
  }

  return { videoPath, posterPath, documentPath, newUploads }
}

export type SessionUpload =
  | { ok: true; supabase: SupabaseClient; uid: string; media: UploadedListingMedia }
  | { ok: false; error: string }

// Shared by SaveDraftButton and CheckoutPrompt — both need the signed-in uid
// (for storage paths) and the uploaded media before calling their own server
// action, and both show the same two failure messages.
export async function resolveSessionAndUpload(
  folderId: string,
  media: ListingMediaSnapshot
): Promise<SessionUpload> {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user.id
    if (!uid) return { ok: false, error: 'You are signed out. Sign in and try again.' }
    const uploaded = await uploadListingMedia(supabase, uid, folderId, media)
    return { ok: true, supabase, uid, media: uploaded }
  } catch {
    return { ok: false, error: 'Uploading your walkthrough failed. Check your connection and try again.' }
  }
}

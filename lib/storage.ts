import { createClient as createBareClient, type SupabaseClient } from '@supabase/supabase-js'

// Single source of truth for the listing storage vocabulary. The buckets
// themselves are provisioned in prisma/migrations/20260724100500_add_listing_storage_buckets.
export const LISTINGS_MEDIA_BUCKET = 'listings-media'
export const COMPLIANCE_DOCS_BUCKET = 'compliance-docs'

// Object path grammar: `{uid}/{folderId}/{timestamp}_{name}` — built by
// lib/listing-upload.ts. Parse it ONLY through these helpers so the layout
// has one home.
export function folderIdFromPath(path: string | null): string | null {
  return path?.split('/')[1] ?? null
}

export function originalNameFromPath(path: string | null): string | null {
  const basename = path?.split('/').pop()
  return basename ? basename.replace(/^\d+_/, '') : null
}

// Ordered by preference; Safari only supports mp4. Kept beside the
// mime→extension map so a new candidate can't silently mislabel its upload.
export const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
]

const VIDEO_EXTENSION_BY_MIME: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
}

export function videoExtensionForMime(mimeType: string): string {
  return VIDEO_EXTENSION_BY_MIME[mimeType] ?? 'webm'
}

// Public URLs are pure string construction — no auth, no cookies, no network —
// so they come from one bare module-level client instead of forcing every
// caller to construct (or await) a session-bound client first.
let urlClient: SupabaseClient | null = null
function getUrlClient(): SupabaseClient {
  urlClient ??= createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
  return urlClient
}

export function listingsMediaPublicUrl(path: string | null): string | null {
  if (!path) return null
  return getUrlClient().storage.from(LISTINGS_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

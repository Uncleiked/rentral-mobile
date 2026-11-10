import { z } from 'zod'
import { LISTING_CATEGORIES, LISTING_METADATA_SCHEMAS, uploadedObjectInfoSchema } from '../contracts/listings'
import { CaptureRequestError, listingRequest } from './capture-client'

const id = z.string().uuid(), path = z.string().min(1).max(500), fileName = z.string().min(1).max(300)
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)
const uploadSchema = z.object({ kind: z.enum(['photo', 'video', 'document']), photoIndex: z.number().int().min(0).max(9).nullable(),
  bucket: z.enum(['listings-media', 'compliance-docs']), path, name: fileName, size: z.number().int().positive().max(200 * 1024 * 1024),
  contentType: z.enum(['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']),
  fingerprintVersion: z.literal('chunked-sha256-v1'), fingerprint: fingerprintSchema,
}).strict().superRefine((upload, context) => {
  const valid = upload.kind === 'photo' ? upload.bucket === 'listings-media' && upload.photoIndex !== null && ['image/jpeg', 'image/png'].includes(upload.contentType) && upload.size <= 10 * 1024 * 1024
    : upload.kind === 'video' ? upload.bucket === 'listings-media' && upload.photoIndex === null && upload.contentType.startsWith('video/')
      : upload.bucket === 'compliance-docs' && upload.photoIndex === null && ['image/jpeg', 'image/png', 'application/pdf'].includes(upload.contentType) && upload.size <= 10 * 1024 * 1024
  if (!valid) context.addIssue({ code: 'custom', message: 'This saved gallery upload cannot be confirmed.' })
})
const recoverySchema = z.object({ version: z.literal(1), actorId: id, routeDraftId: id.nullable(), draftId: id.nullable(), revision: z.number().int().nonnegative().nullable(),
  category: z.enum(LISTING_CATEGORIES), folderId: z.string().min(1).max(180), form: z.record(z.string().max(80), z.union([z.string().max(1500), z.boolean()])),
  photos: z.array(z.object({ name: fileName, path: path.nullable() }).strict()).max(10),
  videoPath: path.nullable(), videoName: fileName.nullable(), documentPath: path.nullable(), documentName: fileName.nullable(), pendingUpload: uploadSchema.nullable(), needsRefresh: z.boolean().optional(),
}).strict().superRefine((saved, context) => {
  const paths = [...saved.photos.map(photo => photo.path), saved.videoPath, saved.documentPath, saved.pendingUpload?.path].filter((value): value is string => Boolean(value))
  const owned = (value: string) => {
    const parts = value.split('/')
    return parts.length === 3 && parts[0] === saved.actorId && parts.every(part => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,179}$/.test(part) && !part.includes('..') && !part.endsWith('.'))
  }
  if (paths.some(value => !owned(value)) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,179}$/.test(saved.folderId) || saved.folderId.includes('..')) context.addIssue({ code: 'custom', message: 'The saved upload belongs to an invalid account path.' })
  const permitted = new Set(['address', 'basePrice', ...Object.keys(LISTING_METADATA_SCHEMAS[saved.category].shape)])
  if (Object.keys(saved.form).some(key => !permitted.has(key))) context.addIssue({ code: 'custom', message: 'The saved gallery form includes unrecognized data.' })
  if (saved.pendingUpload?.kind === 'photo' && saved.pendingUpload.photoIndex! >= saved.photos.length) context.addIssue({ code: 'custom', message: 'The saved photo no longer belongs to this selection.' })
})
export type GalleryUploadMarker = z.infer<typeof uploadSchema>
export type GalleryBrowserRecovery = z.infer<typeof recoverySchema>
export const galleryUploadRecoveryKey = (actorId: string) => `rentral.web-gallery.upload.${id.parse(actorId)}`
function storage(required = false): Storage | null {
  try { if (typeof window !== 'undefined') return window.sessionStorage } catch { /* Fail closed before a mutation below. */ }
  if (required) throw new Error('Browser recovery storage is unavailable. Enable site storage before uploading gallery media.')
  return null
}
export function readGalleryRecovery(actorId: string): GalleryBrowserRecovery | null {
  const raw = storage()?.getItem(galleryUploadRecoveryKey(actorId))
  if (raw === null || raw === undefined) return null
  let value: unknown
  try { value = raw.length <= 65536 ? JSON.parse(raw) : null } catch { /* Preserve invalid recovery rather than inventing a new path. */ }
  const saved = recoverySchema.safeParse(value)
  if (!saved.success || saved.data.actorId !== actorId) throw new Error('The saved gallery upload cannot be confirmed. Review Your Listings before clearing browser recovery.')
  return saved.data
}
export function persistGalleryRecovery(input: GalleryBrowserRecovery, expectedPendingPath?: string | null): GalleryBrowserRecovery {
  const permitted = new Set(['address', 'basePrice', ...Object.keys(LISTING_METADATA_SCHEMAS[input.category].shape)])
  const form = Object.fromEntries(Object.entries(input.form).filter(([key, value]) => permitted.has(key) && (typeof value === 'boolean' || typeof value === 'string' && value.length <= 1500)))
  const saved = recoverySchema.parse({ ...input, form }), previous = readGalleryRecovery(saved.actorId)
  if (previous?.pendingUpload && (previous.routeDraftId !== saved.routeDraftId || previous.pendingUpload.path !== (expectedPendingPath ?? saved.pendingUpload?.path))) throw new Error('A different gallery upload still needs readback. Reopen its original recovery before changing these files.')
  if (previous?.pendingUpload && saved.pendingUpload && JSON.stringify(previous.pendingUpload) !== JSON.stringify(saved.pendingUpload)) throw new Error('The original upload instructions cannot be replaced before readback.')
  storage(true)!.setItem(galleryUploadRecoveryKey(saved.actorId), JSON.stringify(saved))
  return saved
}
export function clearGalleryRecovery(actorId: string, expectedPendingPath?: string): void {
  const previous = readGalleryRecovery(actorId)
  if (previous?.pendingUpload && previous.pendingUpload.path !== expectedPendingPath) throw new Error('Check the original gallery upload before clearing its recovery.')
  storage(true)!.removeItem(galleryUploadRecoveryKey(actorId))
}

/** Versioned browser reselection fingerprint; this is NOT the server's full-file
 * SHA-256 storage digest. Standard WebCrypto hashes bounded 1 MiB chunks, then
 * hashes their ordered digest list with a domain/size prefix. No file bytes are
 * retained in recovery storage or allocated as a whole-video ArrayBuffer. */
export async function galleryFileFingerprint(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot safely confirm the selected file here. Open Rentral on localhost or HTTPS before uploading gallery media. The Expo app is unaffected.')
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 200 * 1024 * 1024) throw new Error('Choose a supported non-empty file within the upload limit.')
  const digests: Uint8Array[] = [], chunkSize = 1024 * 1024
  for (let offset = 0; offset < file.size; offset += chunkSize) digests.push(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer())))
  const prefix = new TextEncoder().encode(`rentral-gallery-content-fingerprint-v1:${file.size}:`)
  const ordered = new Uint8Array(prefix.length + digests.length * 32); ordered.set(prefix)
  digests.forEach((digest, index) => ordered.set(digest, prefix.length + index * 32))
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', ordered)), value => value.toString(16).padStart(2, '0')).join('')
}
export async function reselectedGalleryFileMatches(file: File, marker: GalleryUploadMarker): Promise<boolean> {
  return file.size === marker.size && file.type === marker.contentType && await galleryFileFingerprint(file) === marker.fingerprint
}
export async function readGalleryUpload(actorId: string, marker: GalleryUploadMarker) {
  const result = await listingRequest(actorId, `/api/v1/uploads/${marker.bucket}/info?path=${encodeURIComponent(marker.path)}`, uploadedObjectInfoSchema)
  if (result.path !== marker.path || result.size !== marker.size || result.contentType !== marker.contentType) throw new CaptureRequestError('The saved server object does not match this upload. Keep the original recovery and ask support to review it.', 200, 'INVALID_RESPONSE')
  return result
}

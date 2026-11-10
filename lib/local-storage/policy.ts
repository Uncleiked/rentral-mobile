import { mongoReadinessFailure } from '../database/readiness-errors.ts'

export const STORAGE_BUCKETS = ['listings-media', 'compliance-docs', 'profile-avatars'] as const
export type StorageBucket = typeof STORAGE_BUCKETS[number]
export class StorageError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}

export function storageBucket(value: string): StorageBucket {
  if (!STORAGE_BUCKETS.some(bucket => bucket === value)) throw new StorageError(404, 'NOT_FOUND', 'This file area is unavailable.')
  // The runtime allowlist above narrows an external URL/header value.
  return value as StorageBucket
}

function safeSegment(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,179}$/.test(value) && !value.includes('..') && !value.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
}

export function storagePath(bucket: StorageBucket, value: string): string[] {
  storageBucket(bucket)
  const parts = value.split('/')
  const expected = bucket === 'profile-avatars' ? 2 : 3
  if (value.length > 500 || parts.length !== expected || parts.some(part => !safeSegment(part))) throw new StorageError(400, 'INVALID_PATH', 'Use a valid file path belonging to your account.')
  return parts
}

export function storagePrefix(bucket: StorageBucket, value: string): string[] {
  storageBucket(bucket)
  if (!value) return []
  const parts = value.replace(/\/$/, '').split('/')
  if (parts.length >= (bucket === 'profile-avatars' ? 2 : 3) || parts.some(part => !safeSegment(part))) throw new StorageError(400, 'INVALID_PATH', 'Use a valid account folder.')
  return parts
}

export function requireOwnedStoragePath(bucket: StorageBucket, value: string, userId: string): string[] {
  const parts = storagePath(bucket, value)
  if (parts[0] !== userId) throw new StorageError(403, 'FORBIDDEN', 'You can only manage your own files.')
  return parts
}

const EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
  'application/pdf': ['pdf'], 'video/mp4': ['mp4'], 'video/quicktime': ['mov'], 'video/webm': ['webm'],
}

export function uploadPolicy(bucket: StorageBucket, path: string, suppliedType: string | null): { contentType: string; maximumBytes: number } {
  const parts = storagePath(bucket, path)
  const extension = parts.at(-1)?.split('.').at(-1)?.toLowerCase() ?? ''
  const contentType = suppliedType?.split(';')[0].trim().toLowerCase() ?? ''
  const permitted = bucket === 'profile-avatars' ? ['image/jpeg', 'image/png', 'image/webp']
    : bucket === 'compliance-docs' ? ['application/pdf', 'image/jpeg', 'image/png']
    : ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png']
  if (!permitted.includes(contentType) || !EXTENSIONS[contentType]?.includes(extension)) throw new StorageError(415, 'UNSUPPORTED_FILE', 'Use a supported file type and its matching filename extension.')
  return { contentType, maximumBytes: bucket === 'profile-avatars' ? 2 * 1024 * 1024 : contentType.startsWith('video/') ? 200 * 1024 * 1024 : 10 * 1024 * 1024 }
}

function ascii(bytes: Uint8Array, start: number, end: number): string { return String.fromCharCode(...bytes.subarray(start, end)) }

export function detectedContentType(bytes: Uint8Array): string | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf'
  if (bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163) return 'video/webm'
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12)
    if (brand === 'qt  ') return 'video/quicktime'
    if (/^(?:isom|iso[2-9]|mp4[12]|avc1|hvc1|hev1|M4V )$/.test(brand)) return 'video/mp4'
  }
  if (['wide', 'moov'].includes(ascii(bytes, 4, 8))) return 'video/quicktime'
  return null
}

export function verifyUploadBytes(contentType: string, bytes: Uint8Array): void {
  if (detectedContentType(bytes) !== contentType) throw new StorageError(415, 'INVALID_FILE', 'The file contents do not match its declared type. Choose the original file and try again.')
}

export function storageFailure(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  // Uploads also reserve/claim objects in MongoDB. Preserve the trusted setup or
  // connectivity diagnosis instead of telling members that local disk failed.
  const readiness = mongoReadinessFailure(error)
  if (readiness) return new StorageError(readiness.status, readiness.code, readiness.message)
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'ENOENT') return new StorageError(404, 'NOT_FOUND', 'This file is unavailable.')
    if (error.code === 'EEXIST') return new StorageError(409, 'FILE_EXISTS', 'This file already exists. Choose a new filename.')
  }
  return new StorageError(503, 'STORAGE_UNAVAILABLE', 'File storage is temporarily unavailable. Please try again.')
}

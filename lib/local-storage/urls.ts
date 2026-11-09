import { SignJWT, jwtVerify } from 'jose'
import { signingKey } from '@/lib/auth/token'
import { StorageError, storageBucket, storagePath, type StorageBucket } from './policy'

const ISSUER = 'rentral-storage'
const AUDIENCE = 'rentral-files'
export function storageOrigin(): string {
  const parsed = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new StorageError(503, 'STORAGE_UNAVAILABLE', 'The server file address is not configured correctly.')
  return parsed.origin
}
export function storageFileUrl(bucket: StorageBucket, path: string): string {
  storagePath(bucket, path)
  return `${storageOrigin()}/api/v1/files/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
export async function signedStorageUrl(bucket: StorageBucket, path: string, expiresIn = 300): Promise<string> {
  storagePath(bucket, path)
  const seconds = Number.isFinite(expiresIn) ? Math.min(300, Math.max(1, Math.floor(expiresIn))) : 300
  const token = await new SignJWT({ purpose: 'read-file', bucket, path }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + seconds).sign(signingKey())
  return `${storageFileUrl(bucket, path)}?${new URLSearchParams({ token })}`
}
export async function verifyStorageToken(token: string | null, bucket: StorageBucket, path: string): Promise<void> {
  if (!token || token.length > 4096) throw new StorageError(403, 'FORBIDDEN', 'This private file link is invalid or has expired.')
  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'], maxTokenAge: '5m' })
    if (payload.purpose !== 'read-file' || payload.bucket !== bucket || payload.path !== path || typeof payload.exp !== 'number') throw new Error('Invalid file scope')
    storageBucket(String(payload.bucket)); storagePath(bucket, path)
  } catch { throw new StorageError(403, 'FORBIDDEN', 'This private file link is invalid or has expired.') }
}

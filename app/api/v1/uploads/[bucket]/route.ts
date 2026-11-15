import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { UPLOAD_PART_BYTES } from '@/lib/contracts/upload-transport'
import { appStorageDriver } from '@/lib/local-storage/app'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { createAppStorage } from '@/lib/local-storage/app'
import { requireOwnedStoragePath, storageBucket, storagePrefix, storageFailure, uploadPolicy } from '@/lib/local-storage/policy'
import { uploadStoredObject, uploadStoredPart, removeStoredObjects } from '@/lib/storage-claims/service'
import { withTransaction } from '@/lib/database/transactions'
import { assertGalleryPermission } from '@/lib/listings/gallery'

export const runtime = 'nodejs'
// Bound final-part hashing/verification on the server without exceeding Fluid Hobby's limit.
export const maxDuration = 300
type Context = { params: Promise<{ bucket: string }> }
function failure(error: unknown): Response {
  if (error instanceof ApiError || error instanceof z.ZodError) return apiFailure(error, 'uploads')
  const mapped = storageFailure(error)
  return apiFailure(new ApiError(mapped.status, mapped.code, mapped.message), 'uploads')
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const chunked = request.headers.has('x-upload-part') || request.headers.has('x-upload-total-size')
    const identity = await requireApiIdentity(request, { mutation: true, ...(chunked ? { rateLimit: 'upload_part' as const } : {}) })
    const bucket = storageBucket((await context.params).bucket)
    const path = request.headers.get('x-upload-path') ?? ''
    requireOwnedStoragePath(bucket, path, identity.userId)
    const policy = uploadPolicy(bucket, path, request.headers.get('content-type'))
    const query = new URL(request.url).searchParams
    const source = query.get('mediaSource')
    if (source !== null && source !== 'recorded' && source !== 'approved_gallery') throw new ApiError(400, 'INVALID_REQUEST', 'Choose a valid listing media source.')
    if (source === 'approved_gallery') {
      if (bucket !== 'listings-media') throw new ApiError(400, 'INVALID_REQUEST', 'Gallery permission applies to listing photos and videos only.')
      const revision = z.string().regex(/^(0|[1-9][0-9]{0,9})$/).transform(value => Number(value)).pipe(z.number().int().nonnegative().max(2147483647)).parse(query.get('permissionRevision'))
      await withTransaction(tx => assertGalleryPermission(tx, identity.userId, revision))
    }
    const length = request.headers.get('content-length')
    if (length && (!/^\d+$/.test(length) || Number(length) > policy.maximumBytes)) throw new ApiError(413, 'FILE_TOO_LARGE', 'This file exceeds the upload limit.')
    if (chunked) {
      const integer = z.string().regex(/^(0|[1-9][0-9]{0,9})$/).transform(Number).pipe(z.number().int().nonnegative())
      const total = integer.parse(request.headers.get('x-upload-total-size')), part = integer.parse(request.headers.get('x-upload-part'))
      if (part === 0 && !apiRateLimiter.allow(identity.userId + ':upload_start', 20)) throw new ApiError(429, 'RATE_LIMITED', 'You are starting uploads quickly. Please wait before trying again.')
      if (length && Number(length) > UPLOAD_PART_BYTES) throw new ApiError(413, 'UPLOAD_PART_TOO_LARGE', 'This upload part is too large.')
      return apiSuccess(await uploadStoredPart(identity.userId, bucket, path, request.body, policy.contentType, total, part), 201)
    }
    const result = await uploadStoredObject(identity.userId, bucket, path, request.body, policy.contentType)
    return apiSuccess(result, 201)
  } catch (error) { return failure(error) }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    const bucket = storageBucket((await context.params).bucket)
    const input = z.object({ paths: z.array(z.string().max(500)).min(1).max(100) }).strict().parse(await readApiJson(request))
    for (const path of input.paths) requireOwnedStoragePath(bucket, path, identity.userId)
    await removeStoredObjects(identity.userId, bucket, input.paths)
    return apiSuccess(input.paths.map(name => ({ name })))
  } catch (error) { return failure(error) }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const bucket = storageBucket((await context.params).bucket)
    const params = new URL(request.url).searchParams
    if (params.get('capabilities') === '1') return apiSuccess({ chunked: appStorageDriver() === 'mongodb', partSize: UPLOAD_PART_BYTES })
    const prefix = params.get('prefix') || identity.userId
    const parts = storagePrefix(bucket, prefix)
    if (parts[0] !== identity.userId) throw new ApiError(403, 'FORBIDDEN', 'You can only view your own file folders.')
    const limit = z.coerce.number().int().min(1).max(100).parse(params.get('limit') ?? '100')
    return apiSuccess(await createAppStorage().list(bucket, prefix, limit))
  } catch (error) { return failure(error) }
}

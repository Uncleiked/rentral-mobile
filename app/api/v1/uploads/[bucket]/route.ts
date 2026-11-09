import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { createLocalStorage, defaultStorageDirectory } from '@/lib/local-storage/core'
import { requireOwnedStoragePath, storageBucket, storagePrefix, storageFailure, uploadPolicy } from '@/lib/local-storage/policy'

export const runtime = 'nodejs'
type Context = { params: Promise<{ bucket: string }> }
function failure(error: unknown): Response {
  if (error instanceof ApiError || error instanceof z.ZodError) return apiFailure(error, 'uploads')
  const mapped = storageFailure(error)
  return apiFailure(new ApiError(mapped.status, mapped.code, mapped.message), 'uploads')
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    const bucket = storageBucket((await context.params).bucket)
    const path = request.headers.get('x-upload-path') ?? ''
    requireOwnedStoragePath(bucket, path, identity.userId)
    const policy = uploadPolicy(bucket, path, request.headers.get('content-type'))
    const length = request.headers.get('content-length')
    if (length && (!/^\d+$/.test(length) || Number(length) > policy.maximumBytes)) throw new ApiError(413, 'FILE_TOO_LARGE', 'This file exceeds the upload limit.')
    const result = await createLocalStorage(defaultStorageDirectory()).upload(bucket, path, request.body, policy.contentType)
    return apiSuccess(result, 201)
  } catch (error) { return failure(error) }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    const bucket = storageBucket((await context.params).bucket)
    const input = z.object({ paths: z.array(z.string().max(500)).min(1).max(100) }).strict().parse(await readApiJson(request))
    for (const path of input.paths) requireOwnedStoragePath(bucket, path, identity.userId)
    const storage = createLocalStorage(defaultStorageDirectory())
    for (const path of input.paths) await storage.remove(bucket, path)
    return apiSuccess(input.paths.map(name => ({ name })))
  } catch (error) { return failure(error) }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const bucket = storageBucket((await context.params).bucket)
    const params = new URL(request.url).searchParams
    const prefix = params.get('prefix') || identity.userId
    const parts = storagePrefix(bucket, prefix)
    if (parts[0] !== identity.userId) throw new ApiError(403, 'FORBIDDEN', 'You can only view your own file folders.')
    const limit = z.coerce.number().int().min(1).max(100).parse(params.get('limit') ?? '100')
    return apiSuccess(await createLocalStorage(defaultStorageDirectory()).list(bucket, prefix, limit))
  } catch (error) { return failure(error) }
}

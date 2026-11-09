import prisma from '@/lib/db'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess } from '@/lib/api/http'
import { createLocalStorage, defaultStorageDirectory } from '@/lib/local-storage/core'
import { requireOwnedStoragePath, storageBucket, storageFailure, StorageError } from '@/lib/local-storage/policy'
import { storageObjectId } from '@/lib/storage-claims/service'
import { assertStorageClaimsReady } from '@/lib/database/readiness'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ bucket: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const bucket = storageBucket((await params).bucket)
    const path = new URL(request.url).searchParams.get('path') ?? ''
    requireOwnedStoragePath(bucket, path, identity.userId)
    await assertStorageClaimsReady()
    const record = await prisma.storageObject.findFirst({ where: { id: storageObjectId(bucket, path), owner_id: identity.userId, bucket, state: 'available' },
      select: { digest: true, size_bytes: true, content_type: true } })
    if (!record) throw new ApiError(409, 'UPLOAD_UNCONFIRMED', 'This upload is not confirmed as available. Keep the original file and check again; do not send a replacement automatically.')
    const info = await createLocalStorage(defaultStorageDirectory()).info(bucket, path).catch(error => { const failure = storageFailure(error); throw new ApiError(failure.status, failure.code, failure.message) })
    if (record.digest !== info.digest || record.size_bytes !== info.size || record.content_type !== info.contentType) throw new ApiError(409, 'UPLOAD_UNCONFIRMED', 'The uploaded file could not be confirmed. Keep the original file for recovery.')
    return apiSuccess({ path, size: info.size, contentType: info.contentType })
  } catch (error) {
    if (error instanceof StorageError) { const failure = storageFailure(error); return apiFailure(new ApiError(failure.status, failure.code, failure.message), 'uploads/info') }
    return apiFailure(error, 'uploads/info')
  }
}

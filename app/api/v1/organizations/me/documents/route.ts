import prisma from '@/lib/db'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess } from '@/lib/api/http'
import { assertOrganizationsReady } from '@/lib/database/readiness'
import { uploadStoredObject, prepareListingStorage, storageObjectId } from '@/lib/storage-claims/service'
import { StorageError } from '@/lib/local-storage/policy'
export const runtime = 'nodejs'
function validatePath(path: string, userId: string): void {
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== userId || !/^[a-f0-9-]{36}$/i.test(parts[1]) || !/^(registration|supporting)\.(pdf|jpe?g|png)$/i.test(parts[2])) throw new ApiError(400, 'INVALID_PATH', 'Choose a registration document belonging to your organization.')
}
async function requireOrganization(userId: string): Promise<void> {
  await assertOrganizationsReady()
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { account_type: true } })
  if (user?.account_type !== 'organization') throw new ApiError(403, 'ORGANIZATION_REQUIRED', 'Use your organization account to upload registration evidence.')
}
function failure(error: unknown): Response { return apiFailure(error instanceof StorageError ? new ApiError(error.status, error.code, error.message) : error, 'organizations/documents') }
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { admission: false, mutation: true })
    await requireOrganization(actor.userId)
    const path = request.headers.get('x-upload-path') ?? ''
    validatePath(path, actor.userId)
    const result = await uploadStoredObject(actor.userId, 'compliance-docs', path, request.body, request.headers.get('content-type'))
    return apiSuccess(result, 201)
  } catch (error) { return failure(error) }
}
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { admission: false })
    await requireOrganization(actor.userId)
    const path = new URL(request.url).searchParams.get('path') ?? ''
    validatePath(path, actor.userId)
    const row = await prisma.storageObject.findUnique({ where: { id: storageObjectId('compliance-docs', path) } })
    if (!row || row.owner_id !== actor.userId || row.path !== path || row.bucket !== 'compliance-docs') throw new ApiError(404, 'NOT_FOUND', 'The original upload has not been recorded.')
    if (row.state === 'uploading') throw new ApiError(409, 'UPLOAD_IN_PROGRESS', 'The original document is still uploading. Check its status again before choosing another file.')
    if (row.state !== 'available') throw new ApiError(409, 'FILE_UNAVAILABLE', 'The original upload is not available. Contact support before clearing its saved path.')
    const object = (await prepareListingStorage(actor.userId, { documentPath: path }))[0]
    if (!object || object.path !== path) throw new ApiError(409, 'FILE_UNAVAILABLE', 'The original file could not be confirmed.')
    return apiSuccess({ path })
  } catch (error) { return failure(error) }
}

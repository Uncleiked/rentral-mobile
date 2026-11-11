import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { safetyAppealInputSchema } from '@/lib/api/safety'
import { appealSafetyNotice, getOwnSafetyNotices, safetyEnabled } from '@/lib/trust/safety'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { admission: false, platform: true, mutation: true, verified: true })
    const id = z.uuid().parse((await params).id)
    const input = safetyAppealInputSchema.parse(await readApiJson(request, 24576))
    if (!safetyEnabled()) throw new ApiError(503, 'SAFETY_UNAVAILABLE', 'Safety reviews are not available yet.')
    const notice = (await getOwnSafetyNotices(identity.userId)).find(row => row.id === id)
    if (!notice) throw new ApiError(404, 'NOT_FOUND', 'This reviewed notice is unavailable.')
    if (notice.status !== 'active' || notice.appeal) throw new ApiError(409, 'APPEAL_UNAVAILABLE', 'This notice is unavailable or already has an appeal.')
    started = true
    await appealSafetyNotice(identity.userId, { ...input, noticeId: id })
    revalidatePath('/marketplace/appeals')
    return apiSuccess({ submitted: true }, 201)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return apiFailure(new ApiError(409, 'ALREADY_SUBMITTED', 'This notice already has an appeal.'), 'safety-appeal')
    if (started && !(error instanceof ApiError) && !(error instanceof z.ZodError)) return apiFailure(new ApiError(503, 'APPEAL_UNCONFIRMED', 'Your appeal could not be confirmed. Refresh your notices before trying again.'), 'safety-appeal')
    return apiFailure(error, 'safety-appeal')
  }
}

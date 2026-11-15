import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, ApiError, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { directConversationInputSchema } from '@/lib/contracts/messaging'
import { readDirectStart } from '@/lib/messaging/direct'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const input = directConversationInputSchema.parse(apiSearchParams(request))
    const id = await readDirectStart(identity.userId, input)
    if (!id) throw new ApiError(404, 'NOT_COMMITTED', 'This conversation request has not been recorded.')
    return apiSuccess({ id })
  } catch (error) { return apiFailure(error, 'messages/start') }
}

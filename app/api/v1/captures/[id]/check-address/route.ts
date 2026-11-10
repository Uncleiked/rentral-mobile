import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { checkCaptureAddressForOwner } from '@/lib/listings/capture'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    const result = await checkCaptureAddressForOwner(identity.userId, z.uuid().parse((await context.params).id), await readApiJson(request))
    // Earlier native clients reject unknown response fields. Only clients that
    // opt in receive the additive bounded diagnostic; the legacy shape stays exact.
    if (new URL(request.url).searchParams.get('details') === '1') return apiSuccess(result)
    return apiSuccess({ captureId: result.captureId, status: result.status, addressHash: result.addressHash, toleranceMeters: result.toleranceMeters })
  } catch (error) { return apiFailure(error, 'captures/address') }
}

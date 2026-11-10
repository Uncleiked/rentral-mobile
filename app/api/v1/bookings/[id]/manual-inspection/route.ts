import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { z } from 'zod'
import { adminFailure, adminIdSchema } from '@/lib/api/admin'
import { manualInspectionRequestSchema } from '@/lib/contracts/admin'
import { getManualInspection, requestManualInspection } from '@/lib/bookings/manual-inspection'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true }); const query = z.object({ clientId: z.uuid().optional() }).strict().parse(apiSearchParams(request)); return apiSuccess(await getManualInspection(identity.userId, adminIdSchema.parse((await params).id), query.clientId)) }
  catch (error) { return adminFailure(error, 'manual-inspection') }
}
export async function POST(request: Request, { params }: Context): Promise<Response> {
  let started = false
  try { const identity = await requireApiIdentity(request, { platform: true, mutation: true }); const id = adminIdSchema.parse((await params).id), data = manualInspectionRequestSchema.parse(await readApiJson(request)); started = true; return apiSuccess(await requestManualInspection(identity.userId, id, data)) }
  catch (error) { return adminFailure(error, 'manual-inspection-request', started) }
}

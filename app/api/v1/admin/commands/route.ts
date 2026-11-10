import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { adminCommandSchema } from '@/lib/contracts/admin'
import { executeAdminCommand } from '@/lib/operations/admin-console'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  let started = false
  try { const identity = await requireApiIdentity(request, { platform: true, mutation: true }); const data = adminCommandSchema.parse(await readApiJson(request)); started = true; return apiSuccess(await executeAdminCommand(identity.userId, data)) }
  catch (error) { return adminFailure(error, 'admin-command', started) }
}

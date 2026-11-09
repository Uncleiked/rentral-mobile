import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'
import { accountSelect, ensureAccount, isUniqueConstraintError } from '@/lib/accounts/bootstrap'
import { accountPatchSchema, publicAccount } from '@/lib/api/account'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request)
    const account = await ensureAccount({ id: identity.userId, email: identity.email })
    if (!account) throw new ApiError(503, 'ACCOUNT_UNAVAILABLE', 'Your account is not ready yet. Please try again.')
    return apiSuccess(publicAccount(account))
  } catch (error) { return apiFailure(error, 'me') }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { mutation: true })
    const input = accountPatchSchema.parse(await readApiJson(request))
    const previous = await ensureAccount({ id: identity.userId, email: identity.email })
    if (!previous) throw new ApiError(503, 'ACCOUNT_UNAVAILABLE', 'Your account is not ready yet. Please try again.')
    const account = await prisma.user.update({
      where: { id: identity.userId },
      data: { ...(input.username !== undefined ? { username: input.username } : {}), ...(input.bio !== undefined ? { bio: input.bio || null } : {}) },
      select: accountSelect,
    })
    revalidatePath('/marketplace/profile')
    if (previous.username) revalidatePath(`/marketplace/profile/${previous.username}`)
    if (account.username) revalidatePath(`/marketplace/profile/${account.username}`)
    return apiSuccess(publicAccount(account))
  } catch (error) {
    return apiFailure(isUniqueConstraintError(error) ? new ApiError(409, 'USERNAME_TAKEN', 'That username is already taken.') : error, 'me')
  }
}

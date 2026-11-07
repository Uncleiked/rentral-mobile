import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { platformEnabled, PLATFORM_UNAVAILABLE } from '@/lib/platform'
import { ApiError } from './http'
import { apiBearer, cookieMutationOriginAllowed } from './policy'
import { apiRateLimiter } from './rate-limit'

type Options = { mutation?: boolean; verified?: boolean; platform?: boolean }
export type ApiIdentity = { userId: string; mode: 'cookie' | 'bearer' }

export async function requireApiIdentity(request: Request, options: Options = {}): Promise<ApiIdentity> {
  if (options.platform && !platformEnabled()) throw new ApiError(503, 'PLATFORM_UNAVAILABLE', PLATFORM_UNAVAILABLE)
  const authorization = apiBearer(request.headers.get('authorization'))
  if (!authorization) throw new ApiError(401, 'UNAUTHORIZED', 'A valid sign-in is required.')
  if (options.mutation && authorization.mode === 'cookie' && !cookieMutationOriginAllowed(request, process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV)) {
    throw new ApiError(403, 'ORIGIN_REJECTED', 'This request must come from Rentral.')
  }
  let userId: string
  try {
    const client = await createClient()
    const { data, error } = authorization.mode === 'bearer' ? await client.auth.getUser(authorization.token) : await client.auth.getUser()
    if (error || !data.user || data.user.is_anonymous) throw new ApiError(401, 'UNAUTHORIZED', 'A valid sign-in is required.')
    userId = data.user.id
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Sign-in verification is temporarily unavailable.')
  }
  if (!apiRateLimiter.allow(`${userId}:${options.mutation ? 'write' : 'read'}`, options.mutation ? 20 : 120)) {
    throw new ApiError(429, 'RATE_LIMITED', 'You are making requests quickly. Please wait a moment.')
  }
  if (options.verified) {
    const profile = await prisma.user.findUnique({ where: { id: userId }, select: {
      kyc_verified: true, username: true, account_type: true,
      individualProfile: { select: { id: true } }, organizationProfile: { select: { id: true } },
    } })
    const details = profile?.account_type === 'individual' ? profile.individualProfile : profile?.account_type === 'organization' ? profile.organizationProfile : null
    if (!profile?.kyc_verified || !profile.username?.trim() || !details) throw new ApiError(403, 'VERIFICATION_REQUIRED', 'Complete identity verification and your profile to continue.')
  }
  return { userId, mode: authorization.mode }
}

import { apiSuccess } from '@/lib/api/http'
import { createClient } from '@/lib/server'
import { authFailure, authLimit } from '@/lib/auth/api'
export const runtime = 'nodejs'
export async function GET(): Promise<Response> {
  try { const client = await createClient(); const result = await client.auth.getUser(); if (result.error) throw result.error; return apiSuccess({ user: result.data.user }) }
  catch (error) { return authFailure(error) }
}
export async function DELETE(request: Request): Promise<Response> {
  try { authLimit(request); const client = await createClient(); const result = await client.auth.signOut(); if (result.error) throw result.error; return apiSuccess({ signedOut: true }) }
  catch (error) { return authFailure(error) }
}

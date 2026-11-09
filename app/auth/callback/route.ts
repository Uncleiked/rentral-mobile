import { NextResponse } from 'next/server'

// Legacy external-provider callbacks are retired; local JWT accounts use email/password.
export async function GET(request: Request): Promise<Response> {
  const response = NextResponse.redirect(new URL('/sign-in', request.url))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function POST(): Promise<Response> {
  return Response.json({ success: false, code: 'VERIFICATION_REMOVED', error: 'Identity onboarding is no longer required. Sign in to continue.' }, {
    status: 410,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

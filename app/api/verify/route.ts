import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'
import { initiateVerification } from '@/app/onboarding/actions'

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || !('role' in body) ||
      (body.role !== 'individual' && body.role !== 'organization')) {
      return NextResponse.json({ success: false, error: 'Choose a valid account type.' }, { status: 400 })
    }

    const form = new FormData()
    form.set('role', body.role)
    const result = await initiateVerification(form)
    if (!result.url) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({ success: true, data: { url: result.url, session_id: result.session_id } })
  } catch {
    console.error('[api/verify] Verification session request failed')
    return NextResponse.json({ success: false, error: 'Verification is temporarily unavailable.' }, { status: 503 })
  }
}

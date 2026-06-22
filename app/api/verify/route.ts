import { NextResponse } from 'next/server'
import { createClient } from '@/lib/server'

type VerifyRequest = {
  role?: unknown
}

function workflowForRole(role: unknown): {
  accountType: 'individual' | 'organization'
  workflowId: string | undefined
} {
  if (role === 'organization') {
    return {
      accountType: 'organization',
      workflowId: process.env.DIDIT_KYB_WORKFLOW_ID,
    }
  }

  return {
    accountType: 'individual',
    workflowId: process.env.DIDIT_KYC_WORKFLOW_ID,
  }
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as VerifyRequest
    const { accountType, workflowId } = workflowForRole(body.role)

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'Didit workflow is not configured.' },
        { status: 500 },
      )
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const response = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.DIDIT_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: user.id,
        callback: `${origin}/onboarding`,
        callback_method: 'both',
        metadata: {
          account_type: accountType,
          source: 'rentral_onboarding',
        },
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('[api/verify] Didit session creation failed:', detail)
      return NextResponse.json(
        { success: false, error: 'Verification session creation failed.' },
        { status: 502 },
      )
    }

    const session: unknown = await response.json()
    const sessionRecord = session && typeof session === 'object' ? session : {}
    const url =
      'url' in sessionRecord && typeof sessionRecord.url === 'string' ? sessionRecord.url : null
    const sessionId =
      'session_id' in sessionRecord && typeof sessionRecord.session_id === 'string'
        ? sessionRecord.session_id
        : null

    return NextResponse.json({ success: true, data: { url, session_id: sessionId } })
  } catch (error) {
    console.error('[api/verify] Unexpected failure:', error)
    return NextResponse.json(
      { success: false, error: 'Verification pipeline failed.' },
      { status: 500 },
    )
  }
}

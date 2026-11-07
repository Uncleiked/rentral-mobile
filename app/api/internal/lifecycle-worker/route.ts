import { NextResponse } from 'next/server'
import { platformEnabled } from '@/lib/platform'
import { lifecycleAuthorized } from '@/lib/operations/worker-policy'
import { runLifecycleBatch } from '@/lib/operations/lifecycle'

export const maxDuration = 180

export async function POST(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!lifecycleAuthorized(request.headers.get('authorization'))) return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers })
  if (!platformEnabled() || process.env.LIFECYCLE_WORKER_ENABLED !== 'true') return NextResponse.json({ success: false, error: 'Worker is disabled.' }, { status: 503, headers })
  try { return NextResponse.json({ success: true, data: await runLifecycleBatch() }, { headers }) }
  catch { return NextResponse.json({ success: false, error: 'The batch could not complete. Check operational monitoring before retrying.' }, { status: 503, headers }) }
}

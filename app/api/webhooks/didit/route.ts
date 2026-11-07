import { captureServerEvent } from '@/lib/posthog'
import { IdentityProcessingError, readDiditBody, verifyDiditEnvelope } from '@/lib/identity/didit-policy'
import { applyDiditEvent, reconcileDiditMetadata } from '@/lib/identity/didit-service'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request): Promise<Response> {
  try {
    const secret = process.env.DIDIT_WEBHOOK_SECRET
    if (!secret || process.env.DIDIT_ORDERING_ENABLED !== 'true') return new Response('identity webhook unavailable', { status: 503, headers })
    const event = verifyDiditEnvelope(await readDiditBody(request), request.headers, secret)
    const result = await applyDiditEvent(event)
    if (result.needsSync && result.userId) await reconcileDiditMetadata(result.userId, result.eventId)
    if (result.applied && result.userId) {
      try { await captureServerEvent(result.userId, 'verification_completed', { status: result.verificationStatus, kyc_verified: result.verificationStatus === 'verified', account_type: result.accountType }) }
      catch { console.error('[api/webhooks/didit] Telemetry delivery unavailable') }
    }
    return new Response('ok', { headers })
  } catch (error) {
    if (error instanceof IdentityProcessingError) return new Response(error.message, { status: error.status, headers })
    // Never log signatures, document data or raw provider responses.
    console.error('[api/webhooks/didit] Processing unavailable', error instanceof Error ? error.name : 'UnknownError')
    return new Response('identity processing unavailable', { status: 503, headers })
  }
}

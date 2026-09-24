import { mediaWorkerAuthorized } from '@/lib/media/worker-auth'
import { mediaWorkerEnabled, runMediaWorker } from '@/lib/media/worker'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!mediaWorkerAuthorized(request.headers.get('authorization'))) {
    return Response.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers })
  }
  if (!mediaWorkerEnabled()) {
    return Response.json({ success: false, error: 'Media worker is disabled or unconfigured.' }, { status: 503, headers })
  }
  try {
    const data = await runMediaWorker()
    const success = data.dispatch.failed + data.dispatch.retryable + data.reconciliation.failed === 0
    return Response.json({ success, data }, { status: success ? 200 : 503, headers })
  } catch {
    console.warn('[api/internal/media-worker] Batch failed; inspect staging connectivity and configuration.')
    return Response.json({ success: false, error: 'Media processing is temporarily unavailable.' }, { status: 503, headers })
  }
}

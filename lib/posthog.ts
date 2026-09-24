import { PostHog } from 'posthog-node'
import { telemetryEnabled } from '@/lib/telemetry-config'

// flushAt: 1 — server actions and route handlers are short-lived, so events
// must be sent immediately rather than batched (see architecture.md).
const posthogServerClient = telemetryEnabled() ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
  requestTimeout: 1500,
  fetchRetryCount: 0,
}) : null

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  if (!posthogServerClient) return
  try {
    posthogServerClient.capture({ distinctId, event, properties })
    await posthogServerClient.flush()
  } catch {
    console.warn(`[posthog] Could not deliver event "${event}".`)
  }
}

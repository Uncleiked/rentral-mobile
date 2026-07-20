import { PostHog } from 'posthog-node'

// flushAt: 1 — server actions and route handlers are short-lived, so events
// must be sent immediately rather than batched (see architecture.md).
const posthogServerClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
})

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    posthogServerClient.capture({ distinctId, event, properties })
    await posthogServerClient.flush()
  } catch (error) {
    console.error(`[posthog] Failed to capture "${event}":`, error)
  }
}

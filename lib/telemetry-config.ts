export function telemetryEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) &&
    process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== 'false' &&
    (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true')
}

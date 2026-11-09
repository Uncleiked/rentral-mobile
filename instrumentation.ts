import type { Instrumentation } from 'next'

function monitoringEnabled(): boolean {
  return process.env.OLUSO_ENABLED === 'true' && Boolean(process.env.OLUSO_API_KEY?.trim())
}

export async function register(): Promise<void> {
  // Keep this SDK's Node dependencies outside the Edge and browser bundles.
  if (process.env.NEXT_RUNTIME === 'nodejs' && monitoringEnabled()) {
    const { registerMonitoring } = await import('./lib/monitoring/server')
    registerMonitoring()
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs' && monitoringEnabled()) {
    const { reportRequestError } = await import('./lib/monitoring/server')
    await reportRequestError(error, request, context)
  }
}

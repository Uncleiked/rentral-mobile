import type { Instrumentation } from 'next'
import { Oluso, registerOlusoProcessHandlers, createOnRequestError } from '@oluso/nextjs'

let monitor: Oluso | null = null
let requestError: ReturnType<typeof createOnRequestError> | null = null

export function registerMonitoring(): void {
  const apiKey = process.env.OLUSO_API_KEY?.trim()
  if (monitor || process.env.OLUSO_ENABLED !== 'true' || !apiKey) return
  monitor = new Oluso({ apiKey, environment: process.env.NODE_ENV })
  requestError = createOnRequestError(monitor)
  registerOlusoProcessHandlers(monitor)
}

export const reportRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  registerMonitoring()
  if (!requestError) return
  // The SDK's Next 15 adapter expects scalar headers and calls Proxy middleware.
  const headers = Object.fromEntries(Object.entries(request.headers).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]],
  ))
  await requestError(error, { path: request.path, method: request.method, headers }, {
    routerKind: context.routerKind, routePath: context.routePath,
    routeType: context.routeType === 'proxy' ? 'middleware' : context.routeType,
  })
}

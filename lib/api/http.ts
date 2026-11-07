import { z } from 'zod'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message) }
}

const privateHeaders = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization, Cookie', 'X-Content-Type-Options': 'nosniff' }

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status, headers: privateHeaders })
}

export function apiFailure(error: unknown, scope: string): Response {
  if (error instanceof ApiError) return Response.json({ success: false, error: error.message, code: error.code }, {
    status: error.status, headers: { ...privateHeaders, ...(error.status === 429 ? { 'Retry-After': '60' } : {}) },
  })
  if (error instanceof z.ZodError) return Response.json({ success: false, error: 'Check your request details.', code: 'INVALID_REQUEST' }, { status: 400, headers: privateHeaders })
  if (error instanceof Error && error.message === 'RATE_LIMITED') return apiFailure(new ApiError(429, 'RATE_LIMITED', 'You are making requests quickly. Please wait a moment.'), scope)
  if (error instanceof Error && ['FORBIDDEN', 'LISTING_UNAVAILABLE'].includes(error.message)) return apiFailure(new ApiError(404, 'NOT_FOUND', 'This resource is unavailable.'), scope)
  if (error instanceof Error && error.message === 'INVALID_RETRY') return apiFailure(new ApiError(409, 'INVALID_RETRY', 'Use a new client identifier for a different conversation.'), scope)
  console.error(`[api/v1/${scope}] Request failed`, error instanceof Error ? error.name : 'UnknownError')
  return Response.json({ success: false, error: 'This request could not be completed. Please try again.', code: 'REQUEST_FAILED' }, { status: 500, headers: privateHeaders })
}

export function apiSearchParams(request: Request): Record<string, string | string[]> {
  const url = new URL(request.url)
  if (url.search.length > 8192) throw new ApiError(414, 'QUERY_TOO_LONG', 'This query is too long.')
  return Object.fromEntries(Array.from(new Set(url.searchParams.keys()), key => {
    const values = url.searchParams.getAll(key)
    return [key, values.length > 1 ? values : values[0]]
  }))
}

/** Bound the actual stream, including chunked requests without Content-Length. */
export async function readApiJson(request: Request, maximumBytes = 16384): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', 'Use an application/json request body.')
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) throw new ApiError(413, 'BODY_TOO_LARGE', 'This request is too large.')
  if (!request.body) throw new ApiError(400, 'INVALID_JSON', 'Supply a JSON request body.')
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > maximumBytes) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', 'This request is too large.') }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const value: unknown = JSON.parse(text)
    return value
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'INVALID_JSON', 'Supply a valid JSON request body.')
  } finally { reader.releaseLock() }
}

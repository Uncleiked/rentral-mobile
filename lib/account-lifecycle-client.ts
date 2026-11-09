import { z } from 'zod'

/** Same-origin cookies plus the rendered account guard; never retry a close automatically. */
export async function accountLifecycleRequest<T>(path: string, schema: z.ZodType<T>, userId: string, body?: unknown): Promise<T> {
  const controller = new AbortController(), deadline = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`/api/v1/account${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', 'X-Rentral-Account': userId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const parsed = z.object({ success: z.boolean(), data: z.unknown().optional(), error: z.string().optional() }).safeParse(await response.json())
    if (!parsed.success) throw new Error('The account response could not be verified. Refresh before continuing.')
    if (!response.ok || !parsed.data.success) throw new Error(parsed.data.error ?? 'This account request could not be completed.')
    const result = schema.safeParse(parsed.data.data)
    if (!result.success) throw new Error('The account response could not be verified. Refresh before continuing.')
    return result.data
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) throw new Error('The result could not be confirmed. Refresh your account status before trying again.')
    throw error
  } finally { clearTimeout(deadline) }
}

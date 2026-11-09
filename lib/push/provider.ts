import { z } from 'zod'
import { expoPushTokenSchema } from './policy'

export class ExpoPushError extends Error {
  constructor(readonly code: 'PUSH_SUBMISSION_UNCONFIRMED' | 'PUSH_PROVIDER_REJECTED' | 'PUSH_RESPONSE_UNVERIFIED', readonly uncertain: boolean) { super(code) }
}
type Fetcher = (input: string, init: RequestInit) => Promise<Response>
const receiptSchema = z.discriminatedUnion('status', [z.object({ status: z.literal('ok') }), z.object({ status: z.literal('error'), details: z.object({ error: z.string().max(100) }).optional() })])
const ticketSchema = z.discriminatedUnion('status', [z.object({ status: z.literal('ok'), id: z.uuid() }), z.object({ status: z.literal('error'), details: z.object({ error: z.string().max(100) }).optional() })])
function providerCode(value: string | undefined): string {
  const codes: Record<string, string> = { DeviceNotRegistered: 'DEVICE_NOT_REGISTERED', MessageTooBig: 'MESSAGE_TOO_BIG', MessageRateExceeded: 'MESSAGE_RATE_EXCEEDED', MismatchSenderId: 'MISMATCH_SENDER_ID', InvalidCredentials: 'INVALID_CREDENTIALS' }
  return value && Object.hasOwn(codes, value) ? codes[value] : 'PUSH_PROVIDER_REJECTED'
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new ExpoPushError('PUSH_RESPONSE_UNVERIFIED', true)
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, body = ''
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 65536) { await reader.cancel(); throw new Error() }; body += decoder.decode(chunk.value, { stream: true }) }; return JSON.parse(body + decoder.decode()) }
  catch { throw new ExpoPushError('PUSH_RESPONSE_UNVERIFIED', true) }
  finally { reader.releaseLock() }
}
/** Expo receipt success confirms provider handoff, never device display.
 * https://docs.expo.dev/push-notifications/sending-notifications/ */
export function createExpoPushClient(accessToken: string, fetcher: Fetcher = (input, init) => fetch(input, init)) {
  z.string().regex(/^[\x21-\x7e]{16,512}$/).parse(accessToken)
  async function request(path: 'send' | 'getReceipts', body: unknown) {
    let response: Response
    try { response = await fetcher(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    catch { throw new ExpoPushError('PUSH_SUBMISSION_UNCONFIRMED', true) }
    if (!response.ok) throw new ExpoPushError('PUSH_PROVIDER_REJECTED', ![400, 401, 403, 404, 413, 422].includes(response.status))
    return boundedJson(response)
  }
  return {
    async send(token: string) {
      const value = await request('send', [{ to: expoPushTokenSchema.parse(token), sound: 'default', channelId: 'default', priority: 'default', ttl: 3600,
        title: 'Rentral update', body: 'Open Rentral to view your notifications.', data: { kind: 'rentral_update' } }])
      const parsed = z.object({ data: z.array(ticketSchema).length(1) }).safeParse(value)
      if (!parsed.success) throw new ExpoPushError('PUSH_RESPONSE_UNVERIFIED', true)
      const ticket = parsed.data.data[0]
      return ticket.status === 'ok' ? { status: 'ticketed' as const, ticketId: ticket.id } : { status: 'failed' as const, code: providerCode(ticket.details?.error), unregistered: ticket.details?.error === 'DeviceNotRegistered' }
    },
    async receipts(ticketIds: string[]) {
      const ids = z.array(z.uuid()).min(1).max(50).parse(ticketIds), value = await request('getReceipts', { ids })
      const parsed = z.object({ data: z.record(z.uuid(), receiptSchema) }).safeParse(value)
      if (!parsed.success || Object.keys(parsed.data.data).some(id => !ids.includes(id))) throw new ExpoPushError('PUSH_RESPONSE_UNVERIFIED', true)
      return new Map(Object.entries(parsed.data.data).map(([id, receipt]) => [id, receipt.status === 'ok' ? { status: 'confirmed' as const, code: null, unregistered: false }
        : { status: 'failed' as const, code: providerCode(receipt.details?.error), unregistered: receipt.details?.error === 'DeviceNotRegistered' }]))
    },
  }
}

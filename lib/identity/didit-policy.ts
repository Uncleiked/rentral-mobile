import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const boundedString = z.string().min(1).max(256)
export const diditEnvelopeSchema = z.object({
  event_id: boundedString, webhook_type: boundedString,
  timestamp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  created_at: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: boundedString.optional(), session_id: boundedString.optional(),
  business_session_id: boundedString.optional(), workflow_id: boundedString.optional(),
  vendor_data: boundedString.nullish(), session_kind: z.enum(['user', 'business']).optional(),
  decision: z.unknown().optional(),
}).passthrough()
export type DiditEnvelope = z.infer<typeof diditEnvelopeSchema>

export class IdentityProcessingError extends Error {
  constructor(public readonly status: number, message: string) { super(message) }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]: [string, unknown]) => [key, canonicalValue(item)]))
  }
  return value
}

export function canonicalDiditJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

function signatureMatches(value: string, supplied: string | null, secret: string): boolean {
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false
  const expected = createHmac('sha256', secret).update(value, 'utf8').digest()
  const received = Buffer.from(supplied, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function verifyDiditEnvelope(rawBody: string, headers: Headers, secret: string, now = Date.now()): DiditEnvelope {
  let raw: unknown
  try { raw = JSON.parse(rawBody) } catch { throw new IdentityProcessingError(400, 'invalid payload') }
  const parsed = diditEnvelopeSchema.safeParse(raw)
  if (!parsed.success) throw new IdentityProcessingError(400, 'invalid event envelope')
  const event = parsed.data
  const validV2 = ['x-signature-v2', 'x-signature-v2-previous'].some(name => signatureMatches(canonicalDiditJson(raw), headers.get(name), secret))
  const validRaw = ['x-signature', 'x-signature-previous'].some(name => signatureMatches(rawBody, headers.get(name), secret))
  if (!validV2 && !validRaw) throw new IdentityProcessingError(401, 'bad signature')
  // X-Timestamp is not itself signed. Bind it to the authenticated body value.
  if (headers.get('x-timestamp') !== String(event.timestamp) || Math.abs(now / 1000 - event.timestamp) > 300 || event.created_at > event.timestamp + 5) {
    throw new IdentityProcessingError(401, 'stale or inconsistent timestamp')
  }
  if (event.session_id && event.business_session_id && event.session_id !== event.business_session_id) throw new IdentityProcessingError(400, 'inconsistent session identifiers')
  return event
}

export function diditVerificationStatus(status: string): string {
  switch (status) {
    case 'Approved': return 'verified'
    case 'Declined': return 'declined'
    case 'In Review': return 'pending_review'
    case 'Expired': case 'KYC Expired': case 'Kyc Expired': case 'Abandoned': return 'expired'
    default: return 'in_progress'
  }
}

export function verificationRestrictionRank(status: string): number {
  const ranks: Record<string, number> = { verified: 0, in_progress: 1, unverified: 1, pending_review: 2, expired: 3, declined: 4 }
  return ranks[status] ?? 5
}

export function sameDiditEvent(storedBody: string, event: DiditEnvelope): boolean {
  try {
    const stored: unknown = JSON.parse(storedBody)
    const bindingSchema = diditEnvelopeSchema.omit({ timestamp: true, decision: true }).strip()
    const previous = bindingSchema.safeParse(stored)
    const incoming = bindingSchema.safeParse(event)
    return previous.success && incoming.success && canonicalDiditJson(previous.data) === canonicalDiditJson(incoming.data)
  } catch { return false }
}

// Retain ordering/binding evidence without copying identity documents or decisions
// into the operational delivery log. The User decision remains the private record.
export function diditLogBody(event: DiditEnvelope): string {
  return JSON.stringify({ event_id: event.event_id, webhook_type: event.webhook_type,
    created_at: event.created_at, status: event.status, session_id: event.session_id,
    business_session_id: event.business_session_id, workflow_id: event.workflow_id,
    vendor_data: event.vendor_data, session_kind: event.session_kind })
}

export async function readDiditBody(request: Request): Promise<string> {
  const maximum = 1024 * 1024
  const announced = request.headers.get('content-length')
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > maximum)) throw new IdentityProcessingError(413, 'payload too large')
  if (!request.body) throw new IdentityProcessingError(400, 'missing payload')
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let body = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maximum) { await reader.cancel(); throw new IdentityProcessingError(413, 'payload too large') }
      body += decoder.decode(part.value, { stream: true })
    }
    return body + decoder.decode()
  } catch (error) {
    if (error instanceof IdentityProcessingError) throw error
    throw new IdentityProcessingError(400, 'invalid payload encoding')
  } finally { reader.releaseLock() }
}

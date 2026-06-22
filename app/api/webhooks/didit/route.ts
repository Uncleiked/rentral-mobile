import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { createAdminClient } from '@/lib/admin'
import prisma from '@/lib/db'

type DiditWebhookPayload = {
  event_id?: unknown
  session_id?: unknown
  business_session_id?: unknown
  status?: unknown
  webhook_type?: unknown
  vendor_data?: unknown
  workflow_id?: unknown
  session_kind?: unknown
  decision?: unknown
}

const SESSION_EVENT_TYPES = new Set(['status.updated', 'data.updated'])

function shortenFloats(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(shortenFloats)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        shortenFloats(entry),
      ]),
    )
  }

  if (typeof value === 'number' && !Number.isInteger(value) && value % 1 === 0) {
    return Math.trunc(value)
  }

  return value
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as object)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortKeys((value as Record<string, unknown>)[key])
        return accumulator
      }, {})
  }

  return value
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function canonicalizePayload(rawBody: string): {
  canonical: string
  payload: DiditWebhookPayload
} | null {
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return {
      canonical: JSON.stringify(sortKeys(shortenFloats(parsed))),
      payload: parsed as DiditWebhookPayload,
    }
  } catch {
    return null
  }
}

function isFreshTimestamp(timestamp: string | null): boolean {
  if (!timestamp) {
    return false
  }

  const parsedTimestamp = Number(timestamp)
  return Number.isFinite(parsedTimestamp) && Math.abs(Date.now() / 1000 - parsedTimestamp) <= 300
}

function verifySignature(canonical: string, signature: string | null): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET
  if (!secret || !signature) {
    return false
  }

  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  const signatureBuffer = Buffer.from(signature, 'hex')

  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  )
}

function mapDiditStatus(status: string | null): string {
  switch (status) {
    case 'Approved':
      return 'verified'
    case 'Declined':
      return 'declined'
    case 'In Review':
      return 'pending_review'
    case 'In Progress':
    case 'Resubmitted':
      return 'in_progress'
    case 'Expired':
    case 'KYC Expired':
    case 'Kyc Expired':
    case 'Abandoned':
      return 'expired'
    default:
      return 'in_progress'
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function syncAppMetadata(userId: string, data: {
  accountType: string | null
  verificationKind: string | null
  verificationStatus: string
  kycVerified: boolean
  username: string | null
}): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      account_type: data.accountType,
      verification_kind: data.verificationKind,
      verification_status: data.verificationStatus,
      kyc_verified: data.kycVerified,
      username: data.username,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const timestamp = request.headers.get('x-timestamp')
  const signature = request.headers.get('x-signature-v2')

  if (!isFreshTimestamp(timestamp)) {
    return new Response('stale webhook', { status: 401 })
  }

  const canonicalized = canonicalizePayload(rawBody)
  if (!canonicalized) {
    return new Response('invalid payload', { status: 400 })
  }

  if (!verifySignature(canonicalized.canonical, signature)) {
    console.warn('[api/webhooks/didit] rejected webhook with invalid signature')
    return new Response('bad signature', { status: 401 })
  }

  const payload = canonicalized.payload
  const eventId = readString(payload.event_id)
  const webhookType = readString(payload.webhook_type)
  const status = readString(payload.status)
  const sessionId = readString(payload.session_id) ?? readString(payload.business_session_id)

  if (!eventId || !webhookType) {
    return new Response('missing event fields', { status: 400 })
  }

  try {
    const existingLog = await prisma.webhookLog.findUnique({
      where: { event_id: eventId },
    })

    if (existingLog?.processed_at) {
      return new Response('ok')
    }

    await prisma.webhookLog.upsert({
      where: { event_id: eventId },
      update: {
        webhook_type: webhookType,
        status,
        session_id: sessionId,
        raw_body: rawBody,
      },
      create: {
        event_id: eventId,
        webhook_type: webhookType,
        status,
        session_id: sessionId,
        raw_body: rawBody,
      },
    })

    const vendorDataUserId = readString(payload.vendor_data)
    if (vendorDataUserId && SESSION_EVENT_TYPES.has(webhookType)) {
      const verificationStatus = mapDiditStatus(status)
      const kycVerified = verificationStatus === 'verified'

      const updatedUser = await prisma.user.update({
        where: { id: vendorDataUserId },
        data: {
          kyc_verified: kycVerified,
          verification_status: verificationStatus,
          didit_session_id: sessionId,
          didit_workflow_id: readString(payload.workflow_id),
          didit_decision: toJsonInput(payload.decision),
        },
      })

      await syncAppMetadata(vendorDataUserId, {
        accountType: updatedUser.account_type,
        verificationKind: updatedUser.verification_kind,
        verificationStatus,
        kycVerified,
        username: updatedUser.username,
      })
    }

    await prisma.webhookLog.update({
      where: { event_id: eventId },
      data: { processed_at: new Date() },
    })
  } catch (error) {
    console.error('[api/webhooks/didit] processing failed:', error)
    return new Response('error processing', { status: 500 })
  }

  return new Response('ok')
}

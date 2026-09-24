import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { createAdminClient } from '@/lib/admin'
import prisma from '@/lib/db'
import { captureServerEvent } from '@/lib/posthog'

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

  let parsedTimestamp = Number(timestamp)
  if (!Number.isFinite(parsedTimestamp)) {
    return false
  }

  // If timestamp is suspiciously large, it's likely in milliseconds. Convert to seconds.
  if (parsedTimestamp > 1e11) {
    parsedTimestamp = Math.floor(parsedTimestamp / 1000)
  }

  return Math.abs(Date.now() / 1000 - parsedTimestamp) <= 300
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
  profileCompleted: boolean
}): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      account_type: data.accountType,
      verification_kind: data.verificationKind,
      verification_status: data.verificationStatus,
      kyc_verified: data.kycVerified,
      username: data.username,
      profile_completed: data.profileCompleted,
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
    console.warn(`[api/webhooks/didit] Stale or missing timestamp. Received: ${timestamp}`)
    return new Response('stale webhook', { status: 401 })
  }

  const canonicalized = canonicalizePayload(rawBody)
  if (!canonicalized) {
    console.warn('[api/webhooks/didit] Failed to canonicalize payload. Invalid JSON.')
    return new Response('invalid payload', { status: 400 })
  }

  if (!verifySignature(canonicalized.canonical, signature)) {
    console.warn(`[api/webhooks/didit] Signature mismatch. Received signature: ${signature}`)
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
      const workflowId = readString(payload.workflow_id)
      if (!sessionId || !workflowId || !status) {
        return new Response('missing session fields', { status: 400 })
      }
      const currentUser = await prisma.user.findUnique({ where: { id: vendorDataUserId } })
      // The provider can deliver its first event before session creation returns.
      // Ask for a retry while that session is being persisted.
      if (currentUser && !currentUser.didit_session_id) {
        return new Response('session not ready', { status: 503 })
      }
      const verificationStatus = mapDiditStatus(status)
      const kycVerified = verificationStatus === 'verified'

      const updated = await prisma.user.updateMany({
        where: { id: vendorDataUserId, didit_session_id: sessionId, didit_workflow_id: workflowId },
        data: {
          kyc_verified: kycVerified,
          verification_status: verificationStatus,
          didit_session_id: sessionId,
          didit_workflow_id: readString(payload.workflow_id),
          didit_decision: toJsonInput(payload.decision),
        },
      })

      if (updated.count === 0) {
        await prisma.webhookLog.update({ where: { event_id: eventId }, data: { processed_at: new Date() } })
        return new Response('ignored superseded session')
      }
      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: vendorDataUserId },
        include: { individualProfile: true, organizationProfile: true },
      })

      const profileCompleted = !!(updatedUser.individualProfile || updatedUser.organizationProfile)

      await syncAppMetadata(vendorDataUserId, {
        accountType: updatedUser.account_type,
        verificationKind: updatedUser.verification_kind,
        verificationStatus: updatedUser.verification_status,
        kycVerified: updatedUser.kyc_verified,
        username: updatedUser.username,
        profileCompleted,
      })

      await captureServerEvent(vendorDataUserId, 'verification_completed', {
        status: verificationStatus,
        kyc_verified: kycVerified,
        account_type: updatedUser.account_type,
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

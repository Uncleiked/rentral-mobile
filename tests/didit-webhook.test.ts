import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), upsertLog: vi.fn(), latestLog: vi.fn(), finishLog: vi.fn(), findUser: vi.fn(), updateUsers: vi.fn(), syncMetadata: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: {
  $transaction: mocks.transaction,
  webhookLog: { update: mocks.finishLog }, user: { findUnique: mocks.findUser },
} }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ auth: { admin: { updateUserById: mocks.syncMetadata } } }) }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
import { POST } from '@/app/api/webhooks/didit/route'

type UserState = {
  id: string; kyc_verified: boolean; verification_status: string; verification_kind: 'kyc' | 'kyb';
  didit_session_id: string | null; didit_workflow_id: string; account_type: 'individual' | 'organization';
  username: string; individualProfile: { id: string } | null; organizationProfile: { id: string } | null;
  didit_decision?: unknown;
}
type Log = { event_id: string; webhook_type: string; session_id: string | null; status: string | null; raw_body: string; processed_at: Date | null; event_created_at: Date | null; metadata_synced_at: Date | null }
let user: UserState
let logs: Map<string, Log>
let metadataVerified: boolean | undefined
let base: number

function delivery(options: { status?: string; eventId?: string; timestamp?: number; createdAt?: number; workflow?: string; session?: string; kind?: 'business'; missingCreatedAt?: boolean } = {}): Request {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000)
  const status = options.status ?? 'Approved'
  // Intentionally hand-ordered provider-style compact JSON, including Unicode.
  // Signing does not call the implementation's canonicalisation helper.
  const body = JSON.stringify({
    business_session_id: options.kind === 'business' ? (options.session ?? 'session-1') : undefined,
    created_at: options.missingCreatedAt ? undefined : (options.createdAt ?? base),
    decision: { id_verifications: [{ first_name: 'José private fixture' }], session_id: options.session ?? 'session-1', status },
    event_id: options.eventId ?? 'event-1', session_id: options.session ?? 'session-1',
    session_kind: options.kind, status, timestamp, vendor_data: 'user-1',
    webhook_type: 'status.updated', workflow_id: options.workflow ?? 'workflow-1',
  })
  return new Request('https://rentral.example/api/webhooks/didit', { method: 'POST', body, headers: {
    'x-signature-v2': createHmac('sha256', 'test-only-secret').update(body).digest('hex'),
    'x-timestamp': String(timestamp), 'content-type': 'application/json',
  } })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DIDIT_WEBHOOK_SECRET', 'test-only-secret')
  vi.stubEnv('DIDIT_ORDERING_ENABLED', 'true')
  base = Math.floor(Date.now() / 1000) - 20
  metadataVerified = undefined
  logs = new Map()
  user = { id: 'user-1', kyc_verified: false, verification_status: 'in_progress', verification_kind: 'kyc',
    didit_session_id: 'session-1', didit_workflow_id: 'workflow-1', account_type: 'individual',
    username: 'renter', individualProfile: { id: 'profile-1' }, organizationProfile: null }
  mocks.findUser.mockImplementation(async () => structuredClone(user))
  mocks.upsertLog.mockImplementation(async ({ where, create }: { where: { event_id: string }; create: Omit<Log, 'processed_at' | 'event_created_at' | 'metadata_synced_at'> }) => {
    const existing = logs.get(where.event_id)
    if (existing) return { ...existing }
    const item: Log = { ...create, processed_at: null, event_created_at: null, metadata_synced_at: null }
    logs.set(where.event_id, item)
    return { ...item }
  })
  mocks.latestLog.mockImplementation(async ({ where }: { where: { session_id: string } }) => {
    const eligible = Array.from(logs.values()).filter(log => log.session_id === where.session_id && log.processed_at && log.event_created_at)
    eligible.sort((left, right) => (right.event_created_at?.getTime() ?? 0) - (left.event_created_at?.getTime() ?? 0))
    return eligible[0] ?? null
  })
  mocks.finishLog.mockImplementation(async ({ where, data }: { where: { event_id: string }; data: Partial<Log> }) => {
    const record = logs.get(where.event_id)
    if (!record) throw new Error('Missing test receipt')
    logs.set(where.event_id, { ...record, ...data })
    return logs.get(where.event_id)
  })
  mocks.updateUsers.mockImplementation(async ({ where, data }: { where: { id: string; didit_session_id: string; didit_workflow_id: string }; data: Partial<UserState> }) => {
    if (where.id !== user.id || where.didit_session_id !== user.didit_session_id || where.didit_workflow_id !== user.didit_workflow_id) return { count: 0 }
    user = { ...user, ...data }
    return { count: 1 }
  })
  mocks.syncMetadata.mockImplementation(async (_id: string, input: { app_metadata: { kyc_verified: boolean } }) => {
    metadataVerified = input.app_metadata.kyc_verified
    return { error: null }
  })
  const tx = { $queryRaw: mocks.lock, user: { findUnique: mocks.findUser, updateMany: mocks.updateUsers }, webhookLog: { upsert: mocks.upsertLog, findFirst: mocks.latestLog, update: mocks.finishLog } }
  let serial: Promise<void> = Promise.resolve()
  mocks.transaction.mockImplementation((work: (client: typeof tx) => Promise<unknown>) => {
    const result = serial.then(async () => {
      const oldUser = structuredClone(user), oldLogs = structuredClone(logs)
      try { return await work(tx) } catch (error) { user = oldUser; logs = oldLogs; throw error }
    })
    serial = result.then(() => undefined, () => undefined)
    return result
  })
})
afterEach(() => vi.unstubAllEnvs())

it('requires staged ordering activation before touching new columns', async () => {
  vi.stubEnv('DIDIT_ORDERING_ENABLED', 'false')
  expect((await POST(delivery())).status).toBe(503)
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it('rejects unsigned, stale and signed/header-inconsistent deliveries before persistence', async () => {
  const unsigned = delivery()
  unsigned.headers.delete('x-signature-v2')
  expect((await POST(unsigned)).status).toBe(401)
  expect((await POST(delivery({ timestamp: base - 600, createdAt: base - 601 }))).status).toBe(401)
  const replay = delivery({ timestamp: base - 600, createdAt: base - 601 })
  replay.headers.set('x-timestamp', String(Math.floor(Date.now() / 1000)))
  expect((await POST(replay)).status).toBe(401)
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it('rejects missing ordering evidence and malformed hex signatures', async () => {
  expect((await POST(delivery({ missingCreatedAt: true }))).status).toBe(400)
  const invalid = delivery()
  invalid.headers.set('x-signature-v2', `${invalid.headers.get('x-signature-v2')}invalid`)
  expect((await POST(invalid)).status).toBe(401)
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it('accepts full raw-body signatures without falling back to the deprecated Simple variant', async () => {
  const initial = delivery()
  const body = await initial.text()
  const request = new Request(initial.url, { method: 'POST', body, headers: {
    'x-timestamp': initial.headers.get('x-timestamp') ?? '',
    'x-signature': createHmac('sha256', 'test-only-secret').update(body).digest('hex'),
  } })
  expect((await POST(request)).status).toBe(200)
  expect(user.kyc_verified).toBe(true)
})

it('locks the current identity and commits its decision and ordered receipt together', async () => {
  expect((await POST(delivery())).status).toBe(200)
  expect(mocks.lock.mock.calls[0][0].join('')).toContain('FOR UPDATE')
  expect(mocks.updateUsers).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1', didit_session_id: 'session-1', didit_workflow_id: 'workflow-1' } }))
  expect(user.kyc_verified).toBe(true)
  expect(logs.get('event-1')).toMatchObject({ event_created_at: new Date(base * 1000) })
  expect(logs.get('event-1')?.metadata_synced_at).toBeInstanceOf(Date)
  expect(logs.get('event-1')?.raw_body).not.toContain('José private fixture')
})

it('deduplicates a processed delivery without applying or sending metadata twice', async () => {
  expect((await POST(delivery())).status).toBe(200)
  expect((await POST(delivery())).status).toBe(200)
  expect(mocks.updateUsers).toHaveBeenCalledTimes(1)
  expect(mocks.syncMetadata).toHaveBeenCalledTimes(1)
})

it('rejects a conflicting payload that reuses an applied event identifier', async () => {
  await POST(delivery())
  expect((await POST(delivery({ status: 'Declined' }))).status).toBe(400)
  expect(user.kyc_verified).toBe(true)
})

it('ignores superseded sessions, mixed workflows and mixed KYC/KYB kinds', async () => {
  const cases: { session?: string; workflow?: string; kind?: 'business' }[] = [{ session: 'old-session' }, { workflow: 'other-workflow' }, { kind: 'business' }]
  for (const [index, options] of cases.entries()) {
    expect((await POST(delivery({ ...options, eventId: `ignored-${index}` }))).status).toBe(200)
  }
  expect(mocks.updateUsers).not.toHaveBeenCalled()
  expect(mocks.syncMetadata).not.toHaveBeenCalled()
})

it('retries a delivery that races session creation rather than dropping it', async () => {
  user.didit_session_id = null
  expect((await POST(delivery())).status).toBe(503)
  expect(mocks.updateUsers).not.toHaveBeenCalled()
  expect(logs.size).toBe(0)
})

it('never lets an older approval overwrite a newer revocation in the same session', async () => {
  await POST(delivery({ status: 'Declined', eventId: 'revoked', createdAt: base + 5 }))
  await POST(delivery({ status: 'Approved', eventId: 'older-approval', createdAt: base }))
  expect(user.kyc_verified).toBe(false)
  expect(metadataVerified).toBe(false)
  expect(mocks.updateUsers).toHaveBeenCalledTimes(1)
  expect(logs.get('older-approval')?.event_created_at).toBeNull()
})

it('resolves same-second ambiguity toward restriction and needs a strictly newer approval', async () => {
  await POST(delivery({ eventId: 'approval' }))
  await POST(delivery({ status: 'Declined', eventId: 'revoked' }))
  await POST(delivery({ status: 'Approved', eventId: 'ambiguous-approval' }))
  expect(user.kyc_verified).toBe(false)
  await POST(delivery({ status: 'Approved', eventId: 'new-approval', createdAt: base + 1 }))
  expect(user.kyc_verified).toBe(true)
})

it('keeps revoked database eligibility even when the navigation-cache update fails', async () => {
  await POST(delivery({ eventId: 'approved' }))
  mocks.syncMetadata.mockResolvedValue({ error: { message: 'Private provider diagnostic' } })
  expect((await POST(delivery({ status: 'Declined', eventId: 'revoked', createdAt: base + 1 }))).status).toBe(503)
  expect(user.kyc_verified).toBe(false)
  expect(logs.get('revoked')?.processed_at).toBeInstanceOf(Date)
  expect(logs.get('revoked')?.metadata_synced_at).toBeNull()
  mocks.syncMetadata.mockImplementation(async (_id: string, input: { app_metadata: { kyc_verified: boolean } }) => { metadataVerified = input.app_metadata.kyc_verified; return { error: null } })
  expect((await POST(delivery({ status: 'Declined', eventId: 'revoked', createdAt: base + 1 }))).status).toBe(200)
  expect(metadataVerified).toBe(false)
  expect(mocks.updateUsers).toHaveBeenCalledTimes(2)
})

it('corrects an older in-flight metadata approval after a newer revocation commits', async () => {
  let releaseApproval: () => void = () => undefined
  let announceApproval: () => void = () => undefined
  const approvalStarted = new Promise<void>(resolve => { announceApproval = resolve })
  const release = new Promise<void>(resolve => { releaseApproval = resolve })
  let delayed = false
  mocks.syncMetadata.mockImplementation(async (_id: string, input: { app_metadata: { kyc_verified: boolean } }) => {
    if (input.app_metadata.kyc_verified && !delayed) { delayed = true; announceApproval(); await release }
    metadataVerified = input.app_metadata.kyc_verified
    return { error: null }
  })
  const approved = POST(delivery({ eventId: 'approval' }))
  await approvalStarted
  expect((await POST(delivery({ status: 'Declined', eventId: 'revocation', createdAt: base + 1 }))).status).toBe(200)
  releaseApproval()
  expect((await approved).status).toBe(200)
  expect(user.kyc_verified).toBe(false)
  expect(metadataVerified).toBe(false)
  expect(mocks.syncMetadata).toHaveBeenCalledTimes(3)
})

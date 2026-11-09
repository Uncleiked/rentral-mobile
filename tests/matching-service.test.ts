import type { MatchConnection, MatchMessage, MatchProfile } from '@prisma/client'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ ready: vi.fn(), transaction: vi.fn(), lock: vi.fn(), active: vi.fn(), permission: vi.fn(), user: vi.fn(), users: vi.fn(),
  profile: vi.fn(), profiles: vi.fn(), upsertProfile: vi.fn(), updateProfile: vi.fn(), withdraw: vi.fn(), block: vi.fn(), blocks: vi.fn(), upsertBlock: vi.fn(), deleteBlock: vi.fn(),
  connection: vi.fn(), createConnection: vi.fn(), updateConnection: vi.fn(), closeConnections: vi.fn(), countConnections: vi.fn(),
  message: vi.fn(), messageById: vi.fn(), messages: vi.fn(), createMessage: vi.fn(), report: vi.fn(), reports: vi.fn(), countReports: vi.fn(), createReport: vi.fn(), updateReport: vi.fn(), notify: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertMatchingReady: mocks.ready }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work) }))
vi.mock('@/lib/auth/roles', () => ({ assertStaffPermission: mocks.permission }))
import { getOwnMatchingProfile, matchingCandidates, updateMatchingProfile, withdrawMatchingProfile, withdrawMatchingAccountInTransaction } from '@/lib/matching/profiles'
import type { Prisma } from '@prisma/client'
import { matchingConnection } from '@/lib/matching/views'
import { requestMatchingConnection, decideMatchingConnection } from '@/lib/matching/connections'
import { matchingMessages, persistMatchingMessage, markMatchingRead } from '@/lib/matching/messages'
import { setMatchingBlock } from '@/lib/matching/blocks'
import { matchingReportContext, openMatchingReport, reviewMatchingReport } from '@/lib/matching/reports'

const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222'
const firstProfileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', secondProfileId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const connectionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', messageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const clientId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', reportId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const at = new Date('2030-01-01T10:00:00Z')
const input = { bio: 'A quiet shared home suits me.', neighborhoods: ['yaba'], monthlyMinKobo: '10000000', monthlyMaxKobo: '20000000',
  smoking: 'smoke_free', pets: 'pet_free', guests: 'occasional', quietHours: 'early', isVisible: true }
let firstProfile: MatchProfile, secondProfile: MatchProfile, connection: MatchConnection | null, blocked: boolean
function profile(id: string, userId: string): MatchProfile { return { id, user_id: userId, revision: 0, is_visible: true, moderation_status: 'clear', moderation_reason: null,
  moderated_at: null, moderated_by: null, bio: input.bio, neighborhoods: input.neighborhoods, monthly_min_kobo: BigInt(input.monthlyMinKobo), monthly_max_kobo: BigInt(input.monthlyMaxKobo),
  smoking: input.smoking, pets: input.pets, guests: input.guests, quiet_hours: input.quietHours, createdAt: at, updatedAt: at } }
function contact(): MatchConnection { return { id: connectionId, revision: 0, lower_user_id: first, upper_user_id: second, requested_by: first, status: 'accepted',
  last_requested_at: at, last_activity_at: at, last_message_id: null, accepted_at: at, closed_at: null, lower_read_at: null, upper_read_at: null, createdAt: at, updatedAt: at } }
beforeEach(() => {
  vi.resetAllMocks(); firstProfile = profile(firstProfileId, first); secondProfile = profile(secondProfileId, second); connection = contact(); blocked = false
  mocks.ready.mockResolvedValue(undefined); mocks.lock.mockResolvedValue(true); mocks.permission.mockResolvedValue(undefined)
  mocks.active.mockResolvedValue({ count: 1 })
  const users = [{ id: first, username: 'member_one', avatar_url: null, closed_at: null }, { id: second, username: 'member_two', avatar_url: null, closed_at: null }]
  mocks.user.mockImplementation(async ({ where }: { where: { id: string } }) => users.find(user => user.id === where.id) ?? null)
  mocks.users.mockResolvedValue(users)
  mocks.profile.mockImplementation(async ({ where }: { where: { id?: string; user_id?: string } }) => [firstProfile, secondProfile].find(row => where.id ? row.id === where.id : row.user_id === where.user_id) ?? null)
  mocks.profiles.mockImplementation(async () => [firstProfile, secondProfile])
  mocks.upsertProfile.mockImplementation(async ({ update }: { update: Partial<MatchProfile> }) => ({ ...firstProfile, ...update, revision: 1 }))
  mocks.withdraw.mockResolvedValue({ count: 1 })
  mocks.block.mockImplementation(async () => blocked ? { id: 'block' } : null); mocks.blocks.mockResolvedValue([])
  mocks.upsertBlock.mockImplementation(async () => { blocked = true; return { id: 'block' } }); mocks.deleteBlock.mockImplementation(async () => { blocked = false; return { count: 1 } })
  mocks.connection.mockImplementation(async () => connection)
  mocks.createConnection.mockImplementation(async ({ data }: { data: Partial<MatchConnection> }) => ({ ...contact(), ...data }))
  mocks.updateConnection.mockImplementation(async ({ data }: { data: Partial<MatchConnection> }) => { if (connection) Object.assign(connection, data); return connection })
  mocks.closeConnections.mockResolvedValue({ count: 1 }); mocks.countConnections.mockResolvedValue(0)
  mocks.message.mockResolvedValue(null); mocks.messageById.mockResolvedValue({ id: messageId }); mocks.messages.mockResolvedValue([])
  mocks.createMessage.mockImplementation(async ({ data }: { data: Partial<MatchMessage> }) => ({ id: messageId, createdAt: at, ...data }))
  mocks.report.mockResolvedValue(null); mocks.countReports.mockResolvedValue(0); mocks.createReport.mockResolvedValue({ id: reportId })
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ user: { findUnique: mocks.user, findMany: mocks.users, updateMany: mocks.active },
    matchProfile: { findUnique: mocks.profile, findMany: mocks.profiles, upsert: mocks.upsertProfile, update: mocks.updateProfile, updateMany: mocks.withdraw },
    matchBlock: { findFirst: mocks.block, findMany: mocks.blocks, upsert: mocks.upsertBlock, deleteMany: mocks.deleteBlock },
    matchConnection: { findUnique: mocks.connection, create: mocks.createConnection, update: mocks.updateConnection, updateMany: mocks.closeConnections, count: mocks.countConnections },
    matchMessage: { findUnique: mocks.message, findFirst: mocks.messageById, findMany: mocks.messages, create: mocks.createMessage },
    matchReport: { findUnique: mocks.report, findFirst: mocks.report, findMany: mocks.reports, count: mocks.countReports, create: mocks.createReport, update: mocks.updateReport },
    notification: { create: mocks.notify }, adminAudit: { create: mocks.audit },
  }))
})

it('does not create or publish a profile on read and preserves server moderation on owner edits', async () => {
  mocks.profile.mockResolvedValueOnce(null)
  expect(await getOwnMatchingProfile(first)).toBeNull(); expect(mocks.upsertProfile).not.toHaveBeenCalled()
  firstProfile.moderation_status = 'restricted'; firstProfile.moderation_reason = 'A staff-reviewed restriction.'
  const own = await updateMatchingProfile(first, input)
  expect(own.moderationStatus).toBe('restricted')
  expect(mocks.upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: first }, update: expect.objectContaining({ monthly_min_kobo: BigInt(10000000), is_visible: true }) }))
  expect(mocks.upsertProfile.mock.calls[0][0].update).not.toHaveProperty('moderation_status')
  await expect(updateMatchingProfile(first, { ...input, user_id: second })).rejects.toThrow()
})
it('withdraws under the account lock without deleting messages/history or changing other accounts', async () => {
  await withdrawMatchingProfile(first)
  expect(mocks.withdraw).toHaveBeenCalledExactlyOnceWith({ where: { user_id: first }, data: { is_visible: false, revision: { increment: 1 } } })
  expect(mocks.lock).toHaveBeenCalledWith(expect.any(Object), 'user', first)
})
it('hides a closed account from discovery and denies new commitments while retaining report context', async () => {
  mocks.users.mockResolvedValue([{ id: first, username: 'member_one', avatar_url: null, closed_at: null }, { id: second, username: 'member_two', avatar_url: null, closed_at: new Date() }])
  expect((await matchingCandidates(first, { limit: 20 })).items).toEqual([])
  await expect(matchingMessages(first, connectionId, { limit: 20 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  mocks.active.mockResolvedValue({ count: 0 })
  await expect(requestMatchingConnection(first, { profileId: secondProfileId })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  await expect(persistMatchingMessage(first, connectionId, { clientId, body: 'Denied for closed contact.' })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  expect(mocks.createMessage).not.toHaveBeenCalled()
  expect(await matchingReportContext(first, connectionId)).toEqual({ profileId: secondProfileId, connectionId })
  await expect(matchingReportContext('outsider', connectionId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
it('withdraws matching atomically inside account closure without a nested transaction or erasing history', async () => {
  const tx = { matchProfile: { updateMany: mocks.withdraw }, matchConnection: { updateMany: mocks.closeConnections } } as unknown as Prisma.TransactionClient
  await withdrawMatchingAccountInTransaction(tx, first)
  expect(mocks.withdraw).toHaveBeenCalledWith({ where: { user_id: first }, data: { is_visible: false, revision: { increment: 1 } } })
  expect(mocks.closeConnections).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ lower_user_id: first }, { upper_user_id: first }], status: { in: ['requested', 'accepted'] } }, data: expect.objectContaining({ status: 'closed' }) }))
  expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.lock).not.toHaveBeenCalled()
})
it('validates the latest-message pointer before returning a contact header', async () => {
  if (!connection) throw new Error('Missing fixture')
  connection.last_message_id = messageId
  mocks.messageById.mockResolvedValue({ id: messageId, connection_id: connectionId, sender_id: second, body: 'A bounded preview.', createdAt: at })
  expect(await matchingConnection(first, connectionId)).toMatchObject({ unread: true, lastMessage: { own: false, body: 'A bounded preview.' } })
  mocks.messageById.mockResolvedValue(null)
  await expect(matchingConnection(first, connectionId)).rejects.toMatchObject({ code: 'MATCH_DATA_UNAVAILABLE' })
  mocks.messageById.mockResolvedValue({ id: messageId, connection_id: connectionId, sender_id: 'outsider', body: 'Private unrelated message.', createdAt: at })
  await expect(matchingConnection(first, connectionId)).rejects.toMatchObject({ code: 'MATCH_DATA_UNAVAILABLE' })
})
it('requires opt-in and suppresses blocked suggestions before projecting any preference data', async () => {
  firstProfile.is_visible = false
  await expect(matchingCandidates(first, { limit: 20 })).rejects.toThrow('opt in')
  expect(mocks.profiles).not.toHaveBeenCalled()
  firstProfile.is_visible = true; mocks.profiles.mockResolvedValue([secondProfile]); mocks.blocks.mockResolvedValue([{ blocker_id: second, blocked_id: first }])
  expect((await matchingCandidates(first, { limit: 20 })).items).toEqual([])
})
it('exposes only opted-in public fields and exact money, excluding raw user IDs/moderator data', async () => {
  mocks.profiles.mockResolvedValue([secondProfile])
  const page = await matchingCandidates(first, { limit: 20 })
  expect(page.items[0]).toMatchObject({ id: secondProfileId, username: 'member_two', monthlyMinKobo: '10000000', overlap: { score: 100 } })
  expect(JSON.stringify(page)).not.toContain(second)
  expect(page.items[0]).not.toHaveProperty('moderationReason')
  expect(mocks.profiles).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: { not: first }, is_visible: true, moderation_status: 'clear' }) }))
})
it('locks a normalized user pair and creates a request without opening unrestricted messaging', async () => {
  connection = null
  expect(await requestMatchingConnection(first, { profileId: secondProfileId })).toBe(connectionId)
  expect(mocks.active.mock.calls.slice(0, 2).map(call => call[0].where.id)).toEqual([first, second])
  expect(mocks.active).toHaveBeenCalledWith({ where: { id: second, OR: [{ closed_at: null }, { closed_at: { isSet: false } }] }, data: { revision: { increment: 1 } } })
  expect(mocks.createConnection).toHaveBeenCalledWith({ data: expect.objectContaining({ lower_user_id: first, upper_user_id: second, requested_by: first, status: 'requested', last_message_id: null }) })
  expect(mocks.notify).toHaveBeenCalledTimes(1)
})
it('returns the same pending/accepted contact on a repeated request without duplicate notifications', async () => {
  expect(await requestMatchingConnection(first, { profileId: secondProfileId })).toBe(connectionId)
  expect(mocks.createConnection).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled()
  if (!connection) throw new Error('Missing fixture')
  connection.status = 'requested'
  await expect(requestMatchingConnection(second, { profileId: firstProfileId })).rejects.toThrow('existing contact request')
})
it('allows only the invited member to accept and prevents daily contact spam', async () => {
  if (!connection) throw new Error('Missing fixture')
  connection.status = 'requested'
  await expect(decideMatchingConnection(first, connectionId, { decision: 'accept' })).rejects.toThrow('invited member')
  expect(await decideMatchingConnection(second, connectionId, { decision: 'accept' })).toBe('accepted')
  connection = null; mocks.countConnections.mockResolvedValue(5)
  await expect(requestMatchingConnection(first, { profileId: secondProfileId })).rejects.toMatchObject({ status: 429, code: 'CONTACT_RATE_LIMITED' })
})
it.each(['pending', 'blocked', 'withdrawn', 'restricted', 'missing-account'])('rejects message/read access when current state is %s', async state => {
  if (state === 'pending' && connection) connection.status = 'requested'
  if (state === 'blocked') blocked = true
  if (state === 'withdrawn') secondProfile.is_visible = false
  if (state === 'restricted') secondProfile.moderation_status = 'restricted'
  if (state === 'missing-account') mocks.users.mockResolvedValue([{ id: first, username: 'member_one', avatar_url: null }])
  await expect(persistMatchingMessage(first, connectionId, { clientId, body: 'Hello there' })).rejects.toThrow()
  await expect(matchingMessages(first, connectionId, { limit: 20 })).rejects.toThrow()
  expect(mocks.createMessage).not.toHaveBeenCalled(); expect(mocks.messages).not.toHaveBeenCalled()
})
it('commits a message, activity/pointer and generic notification together without leaking message text to email', async () => {
  expect(await persistMatchingMessage(first, connectionId, { clientId, body: 'A private conversation message.' })).toBe(messageId)
  expect(mocks.updateConnection).toHaveBeenCalledWith({ where: { id: connectionId }, data: { last_message_id: messageId, last_activity_at: at } })
  expect(mocks.createMessage.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateConnection.mock.invocationCallOrder[0])
  expect(mocks.notify.mock.calls[0][0].data.body).not.toContain('private conversation message')
})
it('binds durable message retries to the same authenticated sender, connection and content', async () => {
  mocks.message.mockResolvedValue({ id: messageId, connection_id: connectionId, body: 'Hello there' })
  expect(await persistMatchingMessage(first, connectionId, { clientId, body: 'Hello there' })).toBe(messageId)
  await expect(persistMatchingMessage(first, connectionId, { clientId, body: 'Changed content' })).rejects.toMatchObject({ code: 'INVALID_RETRY' })
  expect(mocks.createMessage).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled()
})
it('marks only the actor receipt and does not treat a read acknowledgement as new conversation activity', async () => {
  mocks.messageById.mockResolvedValue({ createdAt: at })
  await markMatchingRead(second, connectionId, messageId)
  expect(mocks.updateConnection).toHaveBeenCalledWith({ where: { id: connectionId }, data: { upper_read_at: expect.any(Date) } })
  expect(mocks.updateConnection.mock.calls[0][0].data).not.toHaveProperty('last_activity_at')
})
it('does not mark undisplayed arrivals read with an empty acknowledgement or regress an existing read cutoff', async () => {
  expect(await markMatchingRead(second, connectionId)).toBe(at.toISOString())
  expect(mocks.updateConnection).not.toHaveBeenCalled()
  if (!connection) throw new Error('Missing fixture')
  const later = new Date(at.getTime() + 1000); connection.upper_read_at = later
  mocks.messageById.mockResolvedValue({ createdAt: at })
  expect(await markMatchingRead(second, connectionId, messageId)).toBe(later.toISOString())
  expect(mocks.updateConnection).not.toHaveBeenCalled()
  mocks.messageById.mockResolvedValue(null)
  await expect(markMatchingRead(second, connectionId, messageId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
it('blocks privately, stops subsequent message access and never reopens a contact when unblocked', async () => {
  await setMatchingBlock(first, secondProfileId, true)
  await expect(persistMatchingMessage(second, connectionId, { clientId, body: 'A blocked reply' })).rejects.toThrow()
  await setMatchingBlock(first, secondProfileId, false)
  expect(mocks.closeConnections).toHaveBeenCalledTimes(1)
  expect(mocks.deleteBlock).toHaveBeenCalledExactlyOnceWith({ where: { blocker_id: first, blocked_id: second } })
  expect(mocks.updateConnection).not.toHaveBeenCalled()
  expect(mocks.createMessage).not.toHaveBeenCalled()
})
it('permits private redress after withdrawal/blocking while binding evidence to this pair and subject', async () => {
  blocked = true; firstProfile.is_visible = false
  expect(await openMatchingReport(first, { profileId: secondProfileId, connectionId, messageId, reason: 'A detailed report about an unwanted message.' })).toBe(reportId)
  expect(mocks.messageById).toHaveBeenCalledWith({ where: { id: messageId, connection_id: connectionId, sender_id: second }, select: { id: true } })
  expect(mocks.createReport).toHaveBeenCalledWith({ data: expect.objectContaining({ opened_by: first, subject_id: second }) })
  mocks.messageById.mockResolvedValue(null)
  await expect(openMatchingReport(first, { profileId: secondProfileId, connectionId, messageId, reason: 'A detailed report about another message.' })).rejects.toThrow('unavailable')
})
it('requires independent current-role staff and records restrictions without creating a public safety notice', async () => {
  mocks.report.mockResolvedValue({ id: reportId, opened_by: first, subject_id: second, status: 'open' })
  const decision = { decision: 'restrict', reason: 'A reviewed matching conduct issue requires restricted visibility.' }
  await expect(reviewMatchingReport(first, reportId, decision)).rejects.toThrow('independent')
  await reviewMatchingReport('staff', reportId, decision)
  expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'staff', 'safety:review')
  expect(mocks.updateProfile).toHaveBeenCalledWith({ where: { id: secondProfileId }, data: expect.objectContaining({ moderation_status: 'restricted', moderated_by: 'staff' }) })
  expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ metadata: { publicSafetyNoticeCreated: false } }) })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), transaction: vi.fn(), lock: vi.fn(), user: vi.fn(), report: vi.fn(),
  findNotice: vi.fn(), createNotice: vi.fn(), updateNotice: vi.fn(), appealTarget: vi.fn(), findAppeal: vi.fn(), createAppeal: vi.fn(), updateAppeal: vi.fn(), audit: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.authenticated }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.lock(model, id); return true } }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction,
  user: { findUnique: mocks.user }, safetyAppeal: { findUnique: mocks.appealTarget }, safetyNotice: { findFirst: mocks.findNotice } } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { appealSafetyNotice, decideSafetyAppeal, hasActiveSafetyNotice, issueSafetyNotice, safetyEnabled } from '@/lib/trust/safety'
import { independentSafetyReviewer, safetyReportSubject } from '@/lib/trust/safety-policy'
import { appealSafetyNoticeAction, decideSafetyAppealAction, issueSafetyNoticeAction } from '@/app/actions/safetyActions'
import { authRedirect } from '@/lib/auth-policy'

const disputeId = '11111111-1111-4111-8111-111111111111'
const noticeId = '22222222-2222-4222-8222-222222222222'
const appealId = '33333333-3333-4333-8333-333333333333'
const reason = 'Synthetic review of the booking and supporting evidence.'
const issue = { disputeId, category: 'misrepresentation', reason, evidenceReviewed: true }
const appeal = { noticeId, statement: 'Synthetic response identifying a mistake in the reported incident.' }
const decision = { appealId, decision: 'removed', reason }

function report() { return { id: disputeId, status: 'open', opened_by: 'seeker', booking: { seeker_id: 'seeker', lister_id: 'host' } } }
function finding() { return { id: noticeId, status: 'active', issued_by: 'staff', subject_id: 'host', dispute: report(), appeal: null } }
function pendingAppeal() { return { id: appealId, notice_id: noticeId, appellant_id: 'host', status: 'pending', notice: finding() } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_SAFETY_ENABLED', 'true')
  vi.stubEnv('RENTRAL_ADMIN_IDS', 'staff, second-staff')
  mocks.authenticated.mockResolvedValue('staff')
  mocks.user.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, staff_role: ['staff', 'second-staff'].includes(where.id) ? 'moderator' : null }))
  mocks.report.mockResolvedValue(report()); mocks.findNotice.mockResolvedValue(finding())
  mocks.createNotice.mockResolvedValue({ id: noticeId }); mocks.appealTarget.mockResolvedValue({ notice_id: noticeId })
  mocks.findAppeal.mockResolvedValue(pendingAppeal())
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    user: { findUnique: mocks.user }, dispute: { findUnique: mocks.report },
    safetyNotice: { findFirst: mocks.findNotice, create: mocks.createNotice, update: mocks.updateNotice },
    safetyAppeal: { findUnique: mocks.findAppeal, create: mocks.createAppeal, update: mocks.updateAppeal },
    adminAudit: { create: mocks.audit }, notification: { create: mocks.notify } }))
})
afterEach(() => vi.unstubAllEnvs())

describe('reviewed safety notice authorization', () => {
  it('keeps all new-table queries off until both cutover gates are enabled', async () => {
    for (const flag of ['RENTRAL_PLATFORM_ENABLED', 'RENTRAL_SAFETY_ENABLED']) {
      vi.stubEnv(flag, 'false')
      expect(safetyEnabled()).toBe(false)
      expect(await hasActiveSafetyNotice('host')).toBe(false)
      expect(await issueSafetyNoticeAction(issue)).toMatchObject({ success: false })
      expect(await appealSafetyNoticeAction(appeal)).toMatchObject({ success: false })
      expect(await decideSafetyAppealAction(decision)).toMatchObject({ success: false })
      vi.stubEnv(flag, 'true')
    }
    expect(mocks.findNotice).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.authenticated).not.toHaveBeenCalled()
  })

  it('derives a reported subject from an actual booking participant, never from arbitrary input', () => {
    expect(safetyReportSubject(report())).toBe('host')
    expect(safetyReportSubject({ ...report(), opened_by: 'host' })).toBe('seeker')
    expect(safetyReportSubject({ ...report(), opened_by: 'outsider' })).toBeNull()
    expect(independentSafetyReviewer('host', report().booking)).toBe(false)
    expect(independentSafetyReviewer('staff', report().booking, 'staff')).toBe(false)
  })

  it('rejects forged staff flags and user-chosen subjects before mutation', async () => {
    mocks.authenticated.mockResolvedValue('ordinary-user')
    expect(await issueSafetyNoticeAction(issue)).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
    mocks.authenticated.mockResolvedValue('staff')
    expect(await issueSafetyNoticeAction({ ...issue, subject_id: 'victim', is_admin: true })).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
    await expect(issueSafetyNotice('ordinary-user', issue)).rejects.toThrow('Staff access')
  })

  it('requires explicit evidence review and a meaningful staff reason', async () => {
    expect(await issueSafetyNoticeAction({ ...issue, evidenceReviewed: false })).toMatchObject({ success: false })
    expect(await issueSafetyNoticeAction({ ...issue, reason: 'Bad review' })).toMatchObject({ success: false })
    expect(mocks.createNotice).not.toHaveBeenCalled()
  })

  it('locks the report and current staff identity and creates the finding, audit and notification atomically', async () => {
    expect(await issueSafetyNoticeAction(issue)).toMatchObject({ success: true })
    expect(mocks.lock).toHaveBeenCalledTimes(2)
    expect(mocks.createNotice).toHaveBeenCalledWith({ data: { dispute_id: disputeId, subject_id: 'host', issued_by: 'staff', category: 'misrepresentation', private_reason: reason } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'issue_safety_notice', actor_id: 'staff', target_id: noticeId }) }))
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user_id: 'host', href: '/marketplace/appeals' }) }))
  })

  it('denies missing staff accounts, participant staff and invalid reporters', async () => {
    mocks.user.mockResolvedValue(null)
    expect(await issueSafetyNoticeAction(issue)).toMatchObject({ success: false })
    mocks.user.mockResolvedValue({ id: 'staff', staff_role: 'moderator' })
    mocks.report.mockResolvedValue({ ...report(), booking: { seeker_id: 'staff', lister_id: 'host' } })
    expect(await issueSafetyNoticeAction(issue)).toMatchObject({ success: false })
    mocks.report.mockResolvedValue({ ...report(), opened_by: 'outsider' })
    expect(await issueSafetyNoticeAction(issue)).toMatchObject({ success: false })
    expect(mocks.createNotice).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('returns a public presence boolean using only active moderated findings', async () => {
    expect(await hasActiveSafetyNotice('host')).toBe(true)
    expect(mocks.findNotice).toHaveBeenCalledWith({ where: { subject_id: 'host', status: 'active' }, select: { id: true } })
  })
})

describe('affected-account redress and independent decisions', () => {
  it('allows signed-in accounts without KYC while protecting signed-out access', () => {
    const revoked = { app_metadata: { kyc_verified: false } }
    expect(authRedirect('/marketplace/appeals', revoked)).toBeNull()
    expect(authRedirect('/marketplace/appeals', null)).toBe('/sign-in')
    expect(authRedirect('/marketplace/appeals-other', revoked)).toBeNull()
    expect(authRedirect('/marketplace/admin', revoked)).toBeNull()
    expect(authRedirect('/marketplace/admin', null)).toBe('/sign-in')
  })

  it('scopes the appeal to its subject with one notice lock; revocation does not block redress', async () => {
    mocks.authenticated.mockResolvedValue('host'); mocks.user.mockResolvedValue({ id: 'host', kyc_verified: false })
    expect(await appealSafetyNoticeAction(appeal)).toMatchObject({ success: true })
    expect(mocks.findNotice).toHaveBeenCalledWith(expect.objectContaining({ where: { id: noticeId, subject_id: 'host', status: 'active' } }))
    expect(mocks.createAppeal).toHaveBeenCalledWith({ data: { notice_id: noticeId, appellant_id: 'host', statement: appeal.statement } })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('denies a missing account, another account, or an already submitted appeal', async () => {
    mocks.user.mockResolvedValue(null)
    await expect(appealSafetyNotice('host', appeal)).rejects.toThrow('unavailable')
    mocks.user.mockResolvedValue({ id: 'host' }); mocks.findNotice.mockResolvedValue(null)
    await expect(appealSafetyNotice('outsider', appeal)).rejects.toThrow('unavailable')
    mocks.findNotice.mockResolvedValue({ ...finding(), appeal: { id: appealId } })
    await expect(appealSafetyNotice('host', appeal)).rejects.toThrow('already')
    expect(mocks.createAppeal).not.toHaveBeenCalled()
  })

  it('requires a different staff reviewer, forbids participant decisions and prevents replay', async () => {
    await expect(decideSafetyAppeal('staff', decision)).rejects.toThrow('independent')
    mocks.user.mockResolvedValue({ staff_role: 'admin' })
    await expect(decideSafetyAppeal('host', decision)).rejects.toThrow('independent')
    mocks.findAppeal.mockResolvedValue({ ...pendingAppeal(), status: 'removed' })
    await expect(decideSafetyAppeal('second-staff', decision)).rejects.toThrow('independent')
    expect(mocks.updateAppeal).not.toHaveBeenCalled(); expect(mocks.updateNotice).not.toHaveBeenCalled()
  })

  it('removes a notice only alongside the independent decision and append-only audit', async () => {
    mocks.authenticated.mockResolvedValue('second-staff')
    expect(await decideSafetyAppealAction(decision)).toMatchObject({ success: true })
    expect(mocks.lock).toHaveBeenCalledTimes(3)
    expect(mocks.updateAppeal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'removed', decided_by: 'second-staff', decision_reason: reason }) }))
    expect(mocks.updateNotice).toHaveBeenCalledWith(expect.objectContaining({ where: { id: noticeId }, data: expect.objectContaining({ status: 'removed' }) }))
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'safety_appeal_removed', target_id: appealId }) }))
  })

  it('keeps a notice active when the independent reviewer upholds it', async () => {
    await decideSafetyAppeal('second-staff', { ...decision, decision: 'upheld' })
    expect(mocks.updateAppeal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'upheld' }) }))
    expect(mocks.updateNotice).not.toHaveBeenCalled()
  })
  it('rechecks a revoked role after acquiring the mutation lock', async () => {
    mocks.user.mockResolvedValueOnce({ staff_role: 'moderator' }).mockResolvedValue({ staff_role: null })
    await expect(issueSafetyNotice('staff', issue)).rejects.toThrow('Staff access')
    expect(mocks.createNotice).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('does not claim success or send a notification after an audit write fails', async () => {
    mocks.authenticated.mockResolvedValue('second-staff'); mocks.audit.mockRejectedValue(new Error('audit unavailable'))
    expect(await decideSafetyAppealAction(decision)).toMatchObject({ success: false })
    expect(mocks.notify).not.toHaveBeenCalled()
  })
})

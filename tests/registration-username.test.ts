import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ create: vi.fn(), find: vi.fn(), session: vi.fn(), hash: vi.fn(), verify: vi.fn(), account: null as Record<string, unknown> | null }))
vi.mock('@/lib/db', () => ({ default: { user: { create: state.create, findUnique: state.find } } }))
vi.mock('@/lib/auth/password', () => ({ hashPassword: state.hash, verifyPassword: state.verify }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: async () => true, withTransaction: (work: (tx: unknown) => unknown) => work({ user: { findUnique: state.find }, authSession: { create: state.session } }) }))
vi.mock('@/lib/auth/api', async original => ({ ...(await original<typeof import('@/lib/auth/api')>()), authLimit: vi.fn() }))
import { registerAccount, loginAccount } from '@/lib/auth/service'
import { POST } from '@/app/api/v1/auth/register/route'
import { usernameSchema } from '@/lib/contracts/username'

const email = 'person@example.test', password = 'chosen-username-password-123'
function request(body: unknown) { return new Request('http://localhost/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('JWT_SECRET', 'username-registration-only-fixture-key-more-than-32-bytes'); state.account = null
  state.hash.mockResolvedValue('fixture-password-hash'); state.verify.mockResolvedValue(true)
  state.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { state.account = { ...data, staff_role: null, closed_at: null, suspended_at: null }; return state.account })
  state.find.mockImplementation(async () => state.account)
  state.session.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' })
})
afterEach(() => vi.unstubAllEnvs())

describe('chosen username is mandatory at account creation', () => {
  it.each([undefined, '', 'ab', 'bad name', 'a'.repeat(25), 'ADMIN', 'rentral', 'support'])('rejects missing, malformed or reserved choice %s before hashing or creating', async username => {
    await expect(registerAccount({ email, password, ...(username === undefined ? {} : { username }) })).rejects.toThrow()
    expect(state.hash).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled(); expect(state.session).not.toHaveBeenCalled()
  })
  it('normalizes and stores the exact chosen name and never generates a fallback', async () => {
    const result = await registerAccount({ email, password, username: ' Chosen_Member ' })
    expect(result.user.email).toBe(email)
    expect(state.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: expect.objectContaining({ username: 'chosen_member' }) }))
    expect(state.session).toHaveBeenCalledTimes(1)
  })
  it('surfaces the final unique-index collision without trying a different handle or issuing a session', async () => {
    state.create.mockRejectedValue({ code: 'P2002', meta: { target: 'User_username_key' } })
    await expect(registerAccount({ email, password, username: 'chosen_member' })).rejects.toMatchObject({ code: 'USERNAME_TAKEN', status: 409 })
    expect(state.create).toHaveBeenCalledTimes(1); expect(state.session).not.toHaveBeenCalled()
  })
  it('preserves the existing email conflict response', async () => {
    state.create.mockRejectedValue({ code: 'P2002', meta: { target: ['email'] } }); state.account = { id: 'existing' }
    await expect(registerAccount({ email, password, username: 'chosen_member' })).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS', status: 409 })
    expect(state.session).not.toHaveBeenCalled()
  })
  it('keeps ordinary sign-in compatible with existing generated usernames', async () => {
    state.account = { id: '11111111-1111-4111-8111-111111111111', email, password_hash: 'fixture-password-hash', username: 'member_existing_legacy', staff_role: null, closed_at: null, suspended_at: null }
    const result = await loginAccount({ email, password })
    expect(result.user.id).toBe(state.account.id); expect(state.account.username).toBe('member_existing_legacy')
    expect(state.create).not.toHaveBeenCalled()
  })
  it('uses the same reserved and normalized format at signup and profile editing', () => {
    expect(usernameSchema.parse(' My_Home ')).toBe('my_home')
    for (const username of ['admin', 'administrator', 'rentral', 'support', 'help', 'system']) expect(usernameSchema.safeParse(username).success).toBe(false)
  })
})

describe('registration HTTP contract', () => {
  it('rejects omitted usernames with an actionable response and no account write', async () => {
    const response = await POST(request({ email, password }))
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'INVALID_USERNAME', error: expect.stringContaining('username') })
    expect(state.create).not.toHaveBeenCalled()
  })
  it('creates only the selected normalized username from a valid request', async () => {
    const response = await POST(request({ email, password, username: 'API_Member' }))
    expect(response.status).toBe(201)
    expect(state.create.mock.calls[0][0].data.username).toBe('api_member')
    expect(JSON.stringify(await response.json())).not.toContain('fixture-password-hash')
  })
  it('returns a clear conflict when the selected username is taken', async () => {
    state.create.mockRejectedValue({ code: 'P2002', meta: { target: ['username'] } })
    const response = await POST(request({ email, password, username: 'api_member' }))
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'USERNAME_TAKEN', error: expect.stringContaining('another username') })
    expect(state.session).not.toHaveBeenCalled()
  })
})

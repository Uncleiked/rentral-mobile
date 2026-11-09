import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { createLocalStorage } from '@/lib/local-storage/core'

const mocks = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), claim: vi.fn(), lock: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.user, revalidateProfilePaths: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { user: { update: mocks.update } } }))
vi.mock('@/lib/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('@/lib/database/transactions', () => ({
  lockRecord: mocks.lock,
  withTransaction: async (work: (tx: { user: { update: typeof mocks.update } }) => Promise<unknown>) => work({ user: { update: mocks.update } }),
}))
vi.mock('@/lib/storage-claims/service', async () => {
  const { verifiedAvatarReference } = await import('@/lib/local-storage/avatars')
  return {
    prepareAvatarStorage: async (userId: string, reference: string) => ({ reference: await verifiedAvatarReference(reference, userId), objects: [] }),
    claimStorageObjects: mocks.claim,
  }
})
import { updateAvatarUrl } from '@/app/actions/profile-edit'

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XIAAAAASUVORK5CYII=', 'base64'))
let root: string
beforeEach(async () => {
  vi.resetAllMocks(); mocks.user.mockResolvedValue('owner'); mocks.update.mockResolvedValue({ username: 'owner_handle' }); mocks.lock.mockResolvedValue(true)
  const testRoot = resolve(process.cwd(), 'test-results'); await mkdir(testRoot, { recursive: true }); root = await mkdtemp(join(testRoot, 'avatar-fixture-'))
  vi.stubEnv('RENTRAL_STORAGE_DIR', root); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  await createLocalStorage(root).upload('profile-avatars', 'owner/avatar.png', new Blob([new Uint8Array(png)]).stream(), 'image/png')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  if (!resolve(root).startsWith(`${resolve(process.cwd(), 'test-results')}${sep}`) || !root.includes('avatar-fixture-')) throw new Error('Unsafe avatar test cleanup')
  await rm(root, { recursive: true, force: true })
})

it.each(['/api/v1/files/profile-avatars/owner/avatar.png', 'http://localhost:3000/api/v1/files/profile-avatars/owner/avatar.png'])('verifies an owned raster file and stores a local relative reference: %s', async reference => {
  expect(await updateAvatarUrl(reference)).toEqual({ success: true })
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owner' }, data: { avatar_url: '/api/v1/files/profile-avatars/owner/avatar.png' }, select: expect.objectContaining({ username: true }) }))
  expect(assertActiveAccounts).toHaveBeenCalledWith(expect.any(Object), ['owner'])
})

it.each([
  '/api/v1/files/profile-avatars/victim/avatar.png',
  'https://external.example/api/v1/files/profile-avatars/owner/avatar.png',
  '//external.example/api/v1/files/profile-avatars/owner/avatar.png',
  '/api/v1/files/compliance-docs/owner/capture/deed.pdf',
  '/api/v1/files/mail-outbox/reset.json',
  '/api/v1/files/profile-avatars/owner/%2e%2e/private.png',
  '/api/v1/files/profile-avatars/owner/../victim/avatar.png',
  '/api/v1/files/profile-avatars/owner/avatar.png?token=private-capability',
  '/api/v1/files/profile-avatars/owner/avatar.svg',
  '/api/v1/files/profile-avatars/owner/missing.png',
])('rejects unowned, external, private or noncanonical avatar references: %s', async reference => {
  expect(await updateAvatarUrl(reference)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('does not trust metadata after the stored image bytes change', async () => {
  await writeFile(join(root, 'profile-avatars', 'owner', 'avatar.png'), new Uint8Array(png.length).fill(65))
  expect(await updateAvatarUrl('/api/v1/files/profile-avatars/owner/avatar.png')).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('requires authentication before inspecting or saving a file reference', async () => {
  mocks.user.mockResolvedValue(null)
  expect(await updateAvatarUrl('/api/v1/files/profile-avatars/owner/avatar.png')).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

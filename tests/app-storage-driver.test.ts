import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const database = vi.hoisted(() => vi.fn())
vi.mock('@/lib/database/readiness', () => ({ mediaStorageDatabase: database }))
import { appStorageDriver, createAppStorage } from '@/lib/local-storage/app'
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VERCEL', ''); vi.stubEnv('RENTRAL_STORAGE_DRIVER', '') })
afterEach(() => vi.unstubAllEnvs())
it('defaults local development to local and Vercel to durable MongoDB', () => {
  expect(appStorageDriver()).toBe('local'); vi.stubEnv('VERCEL', '1'); expect(appStorageDriver()).toBe('mongodb')
  expect(createAppStorage()).toHaveProperty('stream'); expect(database).not.toHaveBeenCalled()
})
it('honors an explicit supported override and rejects unknown driver settings', () => {
  vi.stubEnv('RENTRAL_STORAGE_DRIVER', 'mongodb'); expect(appStorageDriver()).toBe('mongodb')
  vi.stubEnv('VERCEL', '1'); vi.stubEnv('RENTRAL_STORAGE_DRIVER', 'local'); expect(appStorageDriver()).toBe('local')
  vi.stubEnv('RENTRAL_STORAGE_DRIVER', 'typo'); expect(() => createAppStorage()).toThrow('supported server storage driver')
})
it('fails closed on missing database preparation rather than falling back to ephemeral storage', async () => {
  vi.stubEnv('VERCEL', '1'); database.mockRejectedValue(new Error('Explicit database preparation required'))
  await expect(createAppStorage().info('profile-avatars', 'owner/avatar.png')).rejects.toThrow('preparation required')
  expect(database).toHaveBeenCalledTimes(1)
})

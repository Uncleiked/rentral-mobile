import { expect, it, vi } from 'vitest'
import { authFailure } from '@/lib/auth/api'
import { MongoReadinessError } from '@/lib/database/readiness'

it.each(['DATABASE_SETUP_REQUIRED', 'DATABASE_UNAVAILABLE'] as const)('preserves the safe %s readiness failure through authentication', async code => {
  const response = authFailure(new MongoReadinessError(code))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ success: false, code })
  expect(response.headers.get('Cache-Control')).toContain('no-store')
})

it('does not expose unexpected database messages or connection credentials', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const error = Object.assign(new Error('mongodb://private-user:private-password@private-host/rentral'), { code: 'P2028' })
    const response = authFailure(error)
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).not.toContain('private-')
    expect(body).not.toContain('mongodb://')
    expect(log).toHaveBeenCalledWith('[auth] Service unavailable', { type: 'Error', code: 'P2028' })
  } finally { log.mockRestore() }
})

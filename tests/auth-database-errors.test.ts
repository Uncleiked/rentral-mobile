import { expect, it, vi } from 'vitest'
import { authFailure } from '@/lib/auth/api'
import { MongoReadinessError } from '@/lib/database/readiness'
import { apiFailure } from '@/lib/api/http'
import { MONGO_READINESS_MESSAGES } from '@/lib/database/readiness-errors'

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

it.each(['DATABASE_SETUP_REQUIRED', 'DATABASE_UNAVAILABLE'] as const)('handles a reloaded %s error with a trusted constant message', async code => {
  const foreign = Object.assign(new Error('SENSITIVE_URI_NEVER_RETURN'), { name: 'MongoReadinessError', status: 503, code })
  expect(foreign).not.toBeInstanceOf(MongoReadinessError)
  for (const response of [authFailure(foreign), apiFailure(foreign, 'test')]) {
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, code, error: MONGO_READINESS_MESSAGES[code] })
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  }
})

it.each([
  { name: 'MongoReadinessError', status: 503, code: 'SENSITIVE_INVALID_CODE' },
  { name: 'MongoReadinessError', status: 500, code: 'DATABASE_UNAVAILABLE' },
  { name: 'OtherError', status: 503, code: 'DATABASE_UNAVAILABLE' },
])('redacts a readiness lookalike with invalid discriminants', async shape => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const foreign = Object.assign(new Error('SENSITIVE_URI_NEVER_RETURN'), shape)
    const auth = authFailure(foreign), api = apiFailure(foreign, 'test')
    expect(auth.status).toBe(503)
    expect(api.status).toBe(500)
    expect(await auth.json()).toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    const body = await api.text()
    expect(body).toContain('REQUEST_FAILED')
    expect(body).not.toContain('SENSITIVE')
  } finally { log.mockRestore() }
})

it('does not recognize a plain-object readiness lookalike', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const response = apiFailure({ name: 'MongoReadinessError', status: 503, code: 'DATABASE_UNAVAILABLE', message: 'SENSITIVE_URI_NEVER_RETURN' }, 'test')
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'REQUEST_FAILED' })
  } finally { log.mockRestore() }
})

import { expect, it, vi } from 'vitest'
// Importing the module never loads private settings or starts its CLI loop.
import { localWorkerOrigin, runWorkerTick, workerJobs, workerOptions } from '../scripts/run-local-workers.mjs'

it.each(['https://external.example', 'http://localhost:3000/private', 'http://user:pass@localhost:3000', 'http://localhost:3000/?key=private'])('rejects a nonlocal or credential-bearing worker destination %s', origin => {
  expect(() => localWorkerOrigin(origin)).toThrow()
})
it('accepts explicit loopback test ports and bounds CLI timing', () => {
  expect(localWorkerOrigin('http://127.0.0.1:3199')).toBe('http://127.0.0.1:3199')
  expect(workerOptions(['--once'])).toMatchObject({ once: true, intervalMs: 30000 })
  expect(() => workerOptions(['--interval-ms=0'])).toThrow()
})
it('keeps job configuration independent and never returns a malformed credential as a usable job', () => {
  const config = workerJobs({ LIFECYCLE_WORKER_ENABLED: 'true', LIFECYCLE_WORKER_SECRET: 'short', MEDIA_WORKER_ENABLED: 'true', MEDIA_WORKER_SECRET: 'owned-fixture-media-secret-at-least-32-characters' })
  expect(config.jobs).toHaveLength(1); expect(config.jobs[0].name).toBe('media')
  expect(config.problems).toEqual([{ job: 'lifecycle', code: 'CONFIGURE_LIFECYCLE_WORKER_SECRET' }])
})
it('awaits each job, continues after failure and logs only allowlisted numeric results', async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error('private URI and key must not be logged')).mockResolvedValueOnce(Response.json({ success: true, data: { submitted: 2, privateSecret: 'never-print', rawAddress: 'never-print' } }))
  const result = await runWorkerTick('http://127.0.0.1:3199', [{ name: 'lifecycle', path: '/api/internal/lifecycle-worker', secret: 'fake-private-key' }, { name: 'media', path: '/api/internal/media-worker', secret: 'other-fake-key' }],
    { timeoutMs: 1000, signal: new AbortController().signal }, request)
  expect(result).toEqual([{ job: 'lifecycle', status: 'failed', code: 'REQUEST_UNCONFIRMED' }, { job: 'media', status: 'ok', counts: { submitted: 2 } }])
  expect(JSON.stringify(result)).not.toContain('never-print'); expect(JSON.stringify(result)).not.toContain('private-key')
  expect(request).toHaveBeenCalledTimes(2)
})
it('reports partial job progress without treating recorded financial/provider failures as success', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ success: true, data: { reminders: 2, failedJobs: ['financial-reconciliation', 'private-unknown-value'], financial: { receipts: 1, operations: 0 } } }))
  const result = await runWorkerTick('http://localhost:3000', [{ name: 'lifecycle', path: '/api/internal/lifecycle-worker', secret: 'fake-key' }], { timeoutMs: 1000, signal: new AbortController().signal }, request)
  expect(result).toEqual([{ job: 'lifecycle', status: 'partial', counts: { reminders: 2, 'financial.receipts': 1, 'financial.operations': 0 }, failedJobs: ['financial-reconciliation'] }])
})
it('cannot forward a worker credential through an absolute or unexpected job path', async () => {
  const request = vi.fn()
  const result = await runWorkerTick('http://localhost:3000', [{ name: 'lifecycle', path: 'https://external.example', secret: 'fake-key' }], { timeoutMs: 1000, signal: new AbortController().signal }, request)
  expect(result).toEqual([{ job: 'lifecycle', status: 'failed', code: 'INVALID_WORKER_TARGET' }])
  expect(request).not.toHaveBeenCalled()
})

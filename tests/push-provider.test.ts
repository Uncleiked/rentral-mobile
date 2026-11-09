import { expect, it, vi } from 'vitest'
import { createExpoPushClient } from '@/lib/push/provider'
const key = 'owned_fixture_expo_access_token', token = 'ExponentPushToken[owned_fixture_token_1234]', ticket = '11111111-1111-4111-8111-111111111111'
it('sends only the fixed generic payload to the fixed Expo HTTPS endpoint without redirects', async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ data: [{ status: 'ok', id: ticket }] }))
  expect(await createExpoPushClient(key, transport).send(token)).toEqual({ status: 'ticketed', ticketId: ticket })
  expect(transport).toHaveBeenCalledExactlyOnceWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({ method: 'POST', redirect: 'error', cache: 'no-store', headers: expect.objectContaining({ Authorization: `Bearer ${key}` }) }))
  expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual([{ to: token, sound: 'default', channelId: 'default', priority: 'default', ttl: 3600, title: 'Rentral update', body: 'Open Rentral to view your notifications.', data: { kind: 'rentral_update' } }])
})
it.each(['network', 'malformed', 'wrong-count', 'http500'])('never retries uncertain submission %s', async kind => {
  const transport = vi.fn()
  if (kind === 'network') transport.mockRejectedValue(new Error(`secret diagnostics ${token}`))
  else if (kind === 'malformed') transport.mockResolvedValue(Response.json({ data: [{ status: 'ok', id: 'unverified-ticket' }] }))
  else if (kind === 'wrong-count') transport.mockResolvedValue(Response.json({ data: [] }))
  else transport.mockResolvedValue(Response.json({}, { status: 500 }))
  await expect(createExpoPushClient(key, transport).send(token)).rejects.toMatchObject({ uncertain: true })
  expect(transport).toHaveBeenCalledOnce()
})
it('normalizes DeviceNotRegistered without exposing provider text or tokens', async () => {
  const transport = vi.fn().mockResolvedValue(Response.json({ data: [{ status: 'error', message: `private ${token}`, details: { error: 'DeviceNotRegistered' } }] }))
  expect(await createExpoPushClient(key, transport).send(token)).toEqual({ status: 'failed', code: 'DEVICE_NOT_REGISTERED', unregistered: true })
})
it('distinguishes provider handoff from device delivery and permits missing receipts to remain unknown', async () => {
  const transport = vi.fn().mockResolvedValueOnce(Response.json({ data: { [ticket]: { status: 'ok' } } })).mockResolvedValueOnce(Response.json({ data: {} }))
  const client = createExpoPushClient(key, transport)
  expect((await client.receipts([ticket])).get(ticket)).toEqual({ status: 'confirmed', code: null, unregistered: false })
  expect((await client.receipts([ticket])).size).toBe(0)
  expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ ids: [ticket] })
})
it('rejects unrelated receipt IDs and bounds the actual streamed provider response', async () => {
  const foreign = '22222222-2222-4222-8222-222222222222'
  const transport = vi.fn().mockResolvedValueOnce(Response.json({ data: { [foreign]: { status: 'ok' } } })).mockResolvedValueOnce(new Response('x'.repeat(70000)))
  const client = createExpoPushClient(key, transport)
  await expect(client.receipts([ticket])).rejects.toMatchObject({ code: 'PUSH_RESPONSE_UNVERIFIED' })
  await expect(client.send(token)).rejects.toMatchObject({ code: 'PUSH_RESPONSE_UNVERIFIED' })
  expect(transport).toHaveBeenCalledTimes(2)
})

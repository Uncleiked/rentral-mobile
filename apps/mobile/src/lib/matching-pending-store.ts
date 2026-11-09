import { z } from 'zod'
import { matchingMessageInputSchema } from '../../../../lib/matching/policy'
import { matchMessageSchema, type MatchMessage } from '../../../../lib/matching/contracts'
import { sessionStorage } from './session-storage'
import { ApiError } from './api'
import { sendMatchingMessage } from './matching-api'
const id = z.uuid()
const recordSchema = z.object({ version: z.literal(1), actorId: id, connectionId: id, command: matchingMessageInputSchema, confirmedId: id.optional() }).strict()
export type PendingMatchingMessage = Pick<z.infer<typeof recordSchema>, 'command' | 'confirmedId'>
const key = (actorId: string, connectionId: string) => `rentral.match-message.${id.parse(actorId)}.${id.parse(connectionId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, connectionId: string, run: () => Promise<T>): Promise<T> {
  const name = key(actorId, connectionId), next = (queues.get(name) ?? Promise.resolve()).catch(() => undefined).then(run)
  queues.set(name, next)
  void next.finally(() => { if (queues.get(name) === next) queues.delete(name) }).catch(() => undefined)
  return next
}
async function read(actorId: string, connectionId: string): Promise<PendingMatchingMessage | null> {
  const name = key(actorId, connectionId), raw = await sessionStorage.getItem(name)
  if (raw === null) {
    if (await sessionStorage.getItem(`${name}.present`) !== null) throw new Error('Saved matching-message recovery is incomplete. Read the conversation before dismissing it.')
    return null
  }
  let json: unknown
  try { json = JSON.parse(raw) } catch { throw new Error('Saved matching-message recovery could not be read.') }
  const saved = recordSchema.safeParse(json)
  if (!saved.success || saved.data.actorId !== actorId || saved.data.connectionId !== connectionId) throw new Error('Saved matching-message recovery could not be confirmed for this account and contact.')
  return { command: saved.data.command, ...(saved.data.confirmedId ? { confirmedId: saved.data.confirmedId } : {}) }
}
async function write(actorId: string, connectionId: string, record: PendingMatchingMessage) {
  const name = key(actorId, connectionId), saved = recordSchema.parse({ version: 1, actorId, connectionId, ...record })
  await sessionStorage.setItem(`${name}.present`, '1'); await sessionStorage.setItem(name, JSON.stringify(saved))
}
async function remove(actorId: string, connectionId: string) { const name = key(actorId, connectionId); await sessionStorage.removeItem(name); await sessionStorage.removeItem(`${name}.present`) }
export function loadPendingMatchingMessage(actorId: string, connectionId: string) { return serialized(actorId, connectionId, () => read(actorId, connectionId)) }
export function dismissPendingMatchingMessage(actorId: string, connectionId: string) { return serialized(actorId, connectionId, () => remove(actorId, connectionId)) }
export function submitPendingMatchingMessage(actorId: string, connectionId: string, input: z.infer<typeof matchingMessageInputSchema>) {
  return serialized(actorId, connectionId, async () => {
    const command = matchingMessageInputSchema.parse(input), previous = await read(actorId, connectionId)
    if (previous && JSON.stringify(previous.command) !== JSON.stringify(command)) throw new Error('Confirm the saved matching message before sending different content.')
    let record: PendingMatchingMessage = previous ?? { command }
    await write(actorId, connectionId, record)
    if (!record.confirmedId) {
      try { record = { command, confirmedId: (await sendMatchingMessage(connectionId, command, actorId)).id } }
      catch (reason) {
        if (!previous && reason instanceof ApiError && reason.status >= 400 && reason.status < 500 && !['INVALID_RETRY', 'INVALID_RESPONSE', 'ACCOUNT_CHANGED'].includes(reason.code)) await remove(actorId, connectionId)
        throw reason
      }
      await write(actorId, connectionId, record)
    }
    let cleanupPending = false
    try { await remove(actorId, connectionId) } catch { cleanupPending = true }
    return { id: record.confirmedId, cleanupPending }
  })
}
/** A readback can resolve acknowledgment loss without a second send, using the echoed client nonce. */
export function confirmReadMatchingMessage(actorId: string, connectionId: string, input: MatchMessage) {
  return serialized(actorId, connectionId, async () => {
    const message = matchMessageSchema.parse(input), previous = await read(actorId, connectionId)
    if (!previous || !message.own || message.clientId !== previous.command.clientId || message.body !== previous.command.body) throw new ApiError('This message cannot confirm the saved request.', 'INVALID_RESPONSE', 200)
    await write(actorId, connectionId, { ...previous, confirmedId: message.id })
    let cleanupPending = false
    try { await remove(actorId, connectionId) } catch { cleanupPending = true }
    return { id: message.id, cleanupPending }
  })
}

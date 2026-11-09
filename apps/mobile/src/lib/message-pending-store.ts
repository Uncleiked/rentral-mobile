import { z } from 'zod'
import { ApiError } from './api'
import { sessionStorage } from './session-storage'
import { messageCommandSchema, sendThreadMessage, type MessageCommand } from './messaging-api'

const id = z.string().uuid()
const savedSchema = z.object({ version: z.literal(1), actorId: id, conversationId: id, command: messageCommandSchema, confirmedId: id.optional() }).strict()
export type PendingMessage = Pick<z.infer<typeof savedSchema>, 'command' | 'confirmedId'>
const key = (actorId: string, conversationId: string): string => `rentral.message.pending.${id.parse(actorId)}.${id.parse(conversationId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, conversationId: string, run: () => Promise<T>): Promise<T> {
  const name = key(actorId, conversationId)
  const next = (queues.get(name) ?? Promise.resolve()).catch(() => undefined).then(run)
  queues.set(name, next)
  void next.finally(() => { if (queues.get(name) === next) queues.delete(name) }).catch(() => undefined)
  return next
}
async function read(actorId: string, conversationId: string): Promise<PendingMessage | null> {
  const name = key(actorId, conversationId)
  const value = await sessionStorage.getItem(name)
  if (value === null) {
    if (await sessionStorage.getItem(`${name}.present`) !== null) throw new Error('The saved message is incomplete. Check this conversation before dismissing its recovery record.')
    return null
  }
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('The saved message cannot be read. Check this conversation before dismissing its recovery record.') }
  const saved = savedSchema.safeParse(parsed)
  if (!saved.success || saved.data.actorId !== actorId || saved.data.conversationId !== conversationId) throw new Error('The saved message cannot be confirmed. Check this conversation before dismissing its recovery record.')
  return { command: saved.data.command, ...(saved.data.confirmedId ? { confirmedId: saved.data.confirmedId } : {}) }
}
async function write(actorId: string, conversationId: string, record: PendingMessage): Promise<void> {
  const name = key(actorId, conversationId)
  const saved = savedSchema.parse({ version: 1, actorId, conversationId, ...record })
  await sessionStorage.setItem(`${name}.present`, '1')
  await sessionStorage.setItem(name, JSON.stringify(saved))
}
async function remove(actorId: string, conversationId: string): Promise<void> {
  const name = key(actorId, conversationId)
  await sessionStorage.removeItem(name)
  await sessionStorage.removeItem(`${name}.present`)
}
export function loadPendingMessage(actorId: string, conversationId: string): Promise<PendingMessage | null> { return serialized(actorId, conversationId, () => read(actorId, conversationId)) }
export function dismissPendingMessage(actorId: string, conversationId: string): Promise<void> { return serialized(actorId, conversationId, () => remove(actorId, conversationId)) }
export function submitPendingMessage(actorId: string, conversationId: string, input: MessageCommand) {
  return serialized(actorId, conversationId, async () => {
    const command = messageCommandSchema.parse(input)
    const previous = await read(actorId, conversationId)
    if (previous && JSON.stringify(previous.command) !== JSON.stringify(command)) throw new Error('Your saved message still needs confirmation. Resolve it before sending different text or a different listing.')
    let record: PendingMessage = previous ?? { command }
    await write(actorId, conversationId, record)
    if (!record.confirmedId) {
      try { record = { command, confirmedId: (await sendThreadMessage(conversationId, actorId, command)).id } }
      catch (reason) {
        if (!previous && reason instanceof ApiError && reason.status >= 400 && reason.status < 500 && !['INVALID_RETRY', 'INVALID_RESPONSE', 'ACCOUNT_CHANGED'].includes(reason.code)) {
          try { await remove(actorId, conversationId) }
          catch { throw new Error('This message was declined, but its device recovery record could not be cleared. Check the conversation before continuing.') }
        }
        throw reason
      }
      await write(actorId, conversationId, record)
    }
    let cleanupPending = false
    try { await remove(actorId, conversationId) } catch { cleanupPending = true }
    return { id: record.confirmedId, cleanupPending }
  })
}

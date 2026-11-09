import { z } from 'zod'
import { sessionStorage } from './session-storage'
const schema = z.object({ actorId: z.uuid(), installationId: z.uuid(), operation: z.enum(['register', 'revoke']), deviceId: z.uuid().optional() }).strict()
export type PushRecovery = z.infer<typeof schema>
const key = (actorId: string) => `rentral.push.recovery.${z.uuid().parse(actorId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(actorId) ?? Promise.resolve()).catch(() => undefined).then(run)
  queues.set(actorId, next)
  void next.finally(() => { if (queues.get(actorId) === next) queues.delete(actorId) }).catch(() => undefined)
  return next
}
async function read(actorId: string): Promise<PushRecovery | null> {
  const raw = await sessionStorage.getItem(key(actorId))
  if (raw === null) {
    if (await sessionStorage.getItem(`${key(actorId)}.present`) !== null) throw new Error('Push recovery is incomplete. Review your server device registrations before changing them.')
    return null
  }
  let json: unknown
  try { json = JSON.parse(raw) } catch { throw new Error('Push recovery could not be read. Review your server device registrations.') }
  const parsed = schema.safeParse(json)
  if (!parsed.success || parsed.data.actorId !== actorId) throw new Error('Push recovery could not be confirmed for this account.')
  return parsed.data
}
export function loadPushRecovery(actorId: string): Promise<PushRecovery | null> { return serialized(actorId, () => read(actorId)) }
export function savePushRecovery(input: PushRecovery) {
  const value = schema.parse(input)
  return serialized(value.actorId, async () => { await sessionStorage.setItem(`${key(value.actorId)}.present`, '1'); await sessionStorage.setItem(key(value.actorId), JSON.stringify(value)) })
}
export function clearPushRecovery(actorId: string) { return serialized(actorId, async () => { await sessionStorage.removeItem(key(actorId)); await sessionStorage.removeItem(`${key(actorId)}.present`) }) }

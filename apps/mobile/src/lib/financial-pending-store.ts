import { z } from 'zod'
import { sessionStorage } from './session-storage'
import { financialCommandSchema, type FinancialCommand } from './financial-input'
import { requestFinancialOperation } from './financial-api'

const savedCommandSchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), command: financialCommandSchema }).strict()
const key = (actorId: string): string => `rentral.financial.pending.${actorId}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(actorId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(run)
  queues.set(actorId, next)
  void next.finally(() => { if (queues.get(actorId) === next) queues.delete(actorId) }).catch(() => undefined)
  return next
}

/** Native values use the existing device-only encrypted chunked storage. No bank details are stored. */
async function read(actorId: string): Promise<FinancialCommand | null> {
  const value = await sessionStorage.getItem(key(actorId))
  const marker = await sessionStorage.getItem(`${key(actorId)}.present`)
  if (value === null) {
    // A missing/corrupt chunk must not silently reset an uncertain idempotency key.
    if (marker !== null) throw new Error('The saved financial request is incomplete. Review your financial history before dismissing its recovery record.')
    return null
  }
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('The saved financial request cannot be read. Review your financial history before dismissing its recovery record.') }
  const saved = savedCommandSchema.safeParse(parsed)
  if (!saved.success || saved.data.actorId !== actorId) throw new Error('The saved financial request cannot be confirmed. Review your financial history before dismissing its recovery record.')
  return saved.data.command
}
export function loadPendingFinancialCommand(actorId: string): Promise<FinancialCommand | null> { return serialized(actorId, () => read(actorId)) }
async function remove(actorId: string): Promise<void> {
  await sessionStorage.removeItem(key(actorId))
  await sessionStorage.removeItem(`${key(actorId)}.present`)
}
export async function dismissPendingFinancialCommand(actorId: string): Promise<void> {
  await serialized(actorId, () => remove(actorId))
}
export function submitPendingFinancialCommand(actorId: string, command: FinancialCommand) {
  return serialized(actorId, async () => {
    const saved = savedCommandSchema.parse({ version: 1, actorId, command })
    // Persist before any network mutation so a restart can only retry these exact instructions.
    const previous = await read(actorId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(saved.command)) throw new Error('A previous financial request still needs confirmation. Resolve it before creating another.')
    await sessionStorage.setItem(`${key(actorId)}.present`, '1')
    await sessionStorage.setItem(key(actorId), JSON.stringify(saved))
    const operation = await requestFinancialOperation(saved.command, actorId)
    let cleanupPending = false
    try { await remove(actorId) } catch { cleanupPending = true }
    return { operation, cleanupPending }
  })
}

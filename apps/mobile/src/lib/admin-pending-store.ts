import { z } from 'zod'
import { adminCommandSchema, type AdminCommand } from '../../../../lib/contracts/admin'
import { sessionStorage } from './session-storage'
import { executeAdminCommand, readAdminCommand } from './admin-api'
import { ApiError } from './api'

const savedSchema = z.object({ version: z.literal(1), actorId: z.uuid(), command: adminCommandSchema }).strict()
const key = (actorId: string) => `rentral.admin.pending.${z.uuid().parse(actorId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(actorId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(run); queues.set(actorId, next)
  void next.finally(() => { if (queues.get(actorId) === next) queues.delete(actorId) }).catch(() => undefined)
  return next
}
async function read(actorId: string): Promise<AdminCommand | null> {
  const raw = await sessionStorage.getItem(key(actorId)), marker = await sessionStorage.getItem(`${key(actorId)}.present`)
  if (raw === null && marker === null) return null
  let saved: unknown
  try { saved = raw === null ? null : JSON.parse(raw) } catch { /* Show recovery failure below; never invent a new nonce. */ }
  const parsed = savedSchema.safeParse(saved)
  if (!parsed.success || parsed.data.actorId !== actorId) throw new Error('The saved administrative request cannot be confirmed. Review the audit history before clearing its device recovery.')
  return parsed.data.command
}
async function clear(actorId: string): Promise<void> { await sessionStorage.removeItem(key(actorId)); await sessionStorage.removeItem(`${key(actorId)}.present`) }
async function confirmed(actorId: string, command: AdminCommand, receipt: Awaited<ReturnType<typeof readAdminCommand>>) {
  if (receipt.clientId !== command.clientId) throw new Error('The administrative receipt does not match the saved request.')
  let cleanupPending = false
  try { await clear(actorId) } catch { cleanupPending = true }
  return { receipt, cleanupPending }
}
export function loadPendingAdminCommand(actorId: string) { return serialized(actorId, () => read(actorId)) }
export function submitNewAdminCommand(actorId: string, input: AdminCommand) {
  return serialized(actorId, async () => {
    if (await read(actorId)) throw new Error('Check the saved administrative request before creating another decision.')
    const saved = savedSchema.parse({ version: 1, actorId, command: input })
    await sessionStorage.setItem(`${key(actorId)}.present`, '1')
    await sessionStorage.setItem(key(actorId), JSON.stringify(saved))
    return confirmed(actorId, saved.command, await executeAdminCommand(saved.command, actorId))
  })
}
export function checkPendingAdminCommand(actorId: string) {
  return serialized(actorId, async () => {
    const command = await read(actorId)
    if (!command) return { found: false as const, missing: true as const }
    try { return { found: true as const, ...await confirmed(actorId, command, await readAdminCommand(command.clientId, actorId)) } }
    catch (failure) { if (failure instanceof ApiError && failure.status === 404) return { found: false as const, missing: true as const }; throw failure }
  })
}
/** The caller must deliberately press Retry. Read again before sending the same nonce/body. */
export function retryPendingAdminCommand(actorId: string, clientId: string) {
  return serialized(actorId, async () => {
    const command = await read(actorId)
    if (!command || command.clientId !== clientId) throw new Error('This recovery no longer matches the saved administrative request.')
    try { return await confirmed(actorId, command, await readAdminCommand(command.clientId, actorId)) }
    catch (failure) { if (!(failure instanceof ApiError) || failure.status !== 404) throw failure }
    return confirmed(actorId, command, await executeAdminCommand(command, actorId))
  })
}
/** Explicitly offered only after receipt404 and a refreshed audit/target review. */
export function dismissPendingAdminCommand(actorId: string) { return serialized(actorId, async () => {
  const command = await read(actorId).catch(() => null)
  if (command) {
    try { await readAdminCommand(command.clientId, actorId) }
    catch (failure) { if (!(failure instanceof ApiError) || failure.status !== 404) throw failure }
  }
  await clear(actorId)
}) }

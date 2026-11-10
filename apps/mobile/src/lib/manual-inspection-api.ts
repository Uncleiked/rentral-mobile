import { z } from 'zod'
import { manualInspectionRequestSchema, manualInspectionSchema } from '../../../../lib/contracts/admin'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
import { sessionStorage } from './session-storage'

const savedSchema = z.object({ actorId: z.uuid(), bookingId: z.uuid(), command: manualInspectionRequestSchema }).strict()
type SavedInspection = z.infer<typeof savedSchema>
const key = (actorId: string, bookingId: string) => `rentral.inspection.pending.${z.uuid().parse(actorId)}.${z.uuid().parse(bookingId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, bookingId: string, work: () => Promise<T>): Promise<T> {
  const scope = key(actorId, bookingId), previous = queues.get(scope) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(work); queues.set(scope, next)
  void next.finally(() => { if (queues.get(scope) === next) queues.delete(scope) }).catch(() => undefined)
  return next
}
async function readPending(actorId: string, bookingId: string): Promise<SavedInspection | null> {
  const raw = await sessionStorage.getItem(key(actorId, bookingId)), marker = await sessionStorage.getItem(`${key(actorId, bookingId)}.present`)
  if (raw === null && marker === null) return null
  let value: unknown
  try { value = raw === null ? null : JSON.parse(raw) } catch { /* Preserve invalid recovery until reviewed. */ }
  const saved = savedSchema.safeParse(value)
  if (!saved.success || saved.data.actorId !== actorId || saved.data.bookingId !== bookingId) throw new Error('The saved inspection request cannot be confirmed. Review its current status before clearing device recovery.')
  return saved.data
}
export function loadPendingManualInspection(actorId: string, bookingId: string) { return serialized(actorId, bookingId, () => readPending(actorId, bookingId)) }
async function clear(actorId: string, bookingId: string) { await sessionStorage.removeItem(key(actorId, bookingId)); await sessionStorage.removeItem(`${key(actorId, bookingId)}.present`) }
export function clearPendingManualInspection(actorId: string, bookingId: string, expectedClientId?: string) { return serialized(actorId, bookingId, async () => {
  if (expectedClientId && (await readPending(actorId, bookingId))?.command.clientId !== expectedClientId) throw new Error('This inspection recovery no longer matches the current saved request.')
  await clear(actorId, bookingId)
}) }
export async function readManualInspection(bookingId: string, actorId: string, clientId?: string) {
  const query = clientId ? `?clientId=${z.uuid().parse(clientId)}` : ''
  const status = memberResponse(manualInspectionSchema, await api<unknown>(`/bookings/${encodeURIComponent(bookingId)}/manual-inspection${query}`, { expectedUserId: actorId }))
  if (status.bookingId !== bookingId) throw new ApiError('This inspection status belongs to another booking.', 'INVALID_RESPONSE', 200)
  return status
}
export function submitManualInspection(actorId: string, bookingId: string, command: z.infer<typeof manualInspectionRequestSchema>, retry = false) { return serialized(actorId, bookingId, async () => {
  const saved = savedSchema.parse({ actorId, bookingId, command }), previous = await readPending(actorId, bookingId)
  if (previous && (!retry || JSON.stringify(previous) !== JSON.stringify(saved))) throw new Error('Check the original saved inspection request before submitting another.')
  if (retry) {
    try {
      const current = await readManualInspection(bookingId, actorId, saved.command.clientId)
      await clear(actorId, bookingId)
      return current
    } catch (failure) { if (!(failure instanceof ApiError) || failure.status !== 404) throw failure }
  }
  await sessionStorage.setItem(`${key(actorId, bookingId)}.present`, '1')
  await sessionStorage.setItem(key(actorId, bookingId), JSON.stringify(saved))
  const status = memberResponse(manualInspectionSchema, await api<unknown>(`/bookings/${encodeURIComponent(bookingId)}/manual-inspection`, { method: 'POST', body: saved.command, expectedUserId: actorId }))
  if (status.bookingId !== bookingId || status.status === null || status.evidence !== saved.command.evidence) throw new ApiError('The inspection submission could not be confirmed. Check its saved status before sending another.', 'INVALID_RESPONSE', 200)
  await clear(actorId, bookingId)
  return status
}) }

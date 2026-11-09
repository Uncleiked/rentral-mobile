import { z } from 'zod'
import { ApiError } from './api'
import { sessionStorage } from './session-storage'
import { bookingCommandSchema, type BookingCommand, type BookingDetail } from './booking-contracts'
import { createBooking, loadBooking } from './booking-api'

const savedSchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), command: bookingCommandSchema, confirmedId: z.string().uuid().optional() }).strict()
export type PendingBooking = Pick<z.infer<typeof savedSchema>, 'command' | 'confirmedId'>
const key = (actorId: string): string => `rentral.booking.pending.${z.string().uuid().parse(actorId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(actorId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(run)
  queues.set(actorId, next)
  void next.finally(() => { if (queues.get(actorId) === next) queues.delete(actorId) }).catch(() => undefined)
  return next
}
async function read(actorId: string): Promise<PendingBooking | null> {
  const value = await sessionStorage.getItem(key(actorId))
  const marker = await sessionStorage.getItem(`${key(actorId)}.present`)
  if (value === null) {
    if (marker !== null) throw new Error('The saved booking request is incomplete. Review your bookings before dismissing its recovery record.')
    return null
  }
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('The saved booking request cannot be read. Review your bookings before dismissing its recovery record.') }
  const saved = savedSchema.safeParse(parsed)
  if (!saved.success || saved.data.actorId !== actorId) throw new Error('The saved booking request cannot be confirmed. Review your bookings before dismissing its recovery record.')
  return { command: saved.data.command, ...(saved.data.confirmedId ? { confirmedId: saved.data.confirmedId } : {}) }
}
async function write(actorId: string, record: PendingBooking): Promise<void> {
  const saved = savedSchema.parse({ version: 1, actorId, ...record })
  // Marker first: a torn encrypted chunk cannot silently reset an uncertain nonce.
  await sessionStorage.setItem(`${key(actorId)}.present`, '1')
  await sessionStorage.setItem(key(actorId), JSON.stringify(saved))
}
async function remove(actorId: string): Promise<void> {
  await sessionStorage.removeItem(key(actorId))
  await sessionStorage.removeItem(`${key(actorId)}.present`)
}
export function loadPendingBooking(actorId: string): Promise<PendingBooking | null> { return serialized(actorId, () => read(actorId)) }
/** Explicit member dismissal is separate from cancellation of any server booking. */
export function dismissPendingBooking(actorId: string): Promise<void> { return serialized(actorId, () => remove(actorId)) }

function matches(command: BookingCommand, booking: BookingDetail): boolean {
  return booking.role === 'renter' && booking.listing.id === command.listingId && booking.kind === command.kind
    && Date.parse(booking.startsAt) === Date.parse(command.startsAt) && Date.parse(booking.endsAt) === Date.parse(command.endsAt)
    // Allocated holdBookingId can remain null until host acceptance; the request lives in its pricing snapshot.
    && (!command.holdBookingId || booking.quote?.holdBookingId === command.holdBookingId)
    && (command.kind !== 'hold' || (booking.quote?.holdDays ?? 1) === (command.holdDays ?? 1))
}

/** Called only after an explicit send/retry. Nothing replays a request during restoration. */
export function submitPendingBooking(actorId: string, input: BookingCommand) {
  return serialized(actorId, async () => {
    const command = bookingCommandSchema.parse(input)
    const previous = await read(actorId)
    if (previous && JSON.stringify(previous.command) !== JSON.stringify(command)) throw new Error('A previous booking request still needs confirmation. Resolve it before creating another.')
    let record: PendingBooking = previous ?? { command }
    await write(actorId, record)
    if (!record.confirmedId) {
      let result: { id: string }
      try { result = await createBooking(command, actorId) }
      catch (reason) {
        // A definite first-attempt rejection did not create a booking. A recovered request
        // can have reached the server earlier, so its nonce needs deliberate resolution.
        if (!previous && reason instanceof ApiError && reason.status >= 400 && reason.status < 500
          && !['INVALID_RESPONSE', 'INVALID_RETRY', 'ACCOUNT_CHANGED'].includes(reason.code)) {
          try { await remove(actorId) }
          catch { throw new Error('The server declined this booking request, but its recovery record could not be cleared. Review your bookings before continuing.') }
        }
        throw reason
      }
      record = { command, confirmedId: result.id }
      // Remember the acknowledgment before readback: a failed GET must never cause another POST.
      await write(actorId, record)
    }
    const confirmedId = record.confirmedId
    if (!confirmedId) throw new Error('The booking acknowledgment could not be saved.')
    const booking = await loadBooking(confirmedId, undefined, actorId)
    if (!matches(command, booking)) throw new ApiError('The booking acknowledgment does not match your saved request. Check your bookings before continuing.', 'INVALID_RESPONSE', 200)
    let cleanupPending = false
    try { await remove(actorId) } catch { cleanupPending = true }
    return { booking, cleanupPending }
  })
}

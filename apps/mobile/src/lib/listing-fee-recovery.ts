import { z } from 'zod'
import { sessionStorage } from './session-storage'
import { loadPublicationFee, preparePublicationCheckout, reconcilePublicationFee } from './listing-fee-api'

const schema = z.object({ version: z.literal(1), actorId: z.uuid(), listingId: z.uuid(), operation: z.enum(['checkout', 'reconcile']), reference: z.string().min(1).max(160).optional() }).strict()
export type ListingFeeRecovery = z.infer<typeof schema>
const key = (actorId: string, listingId: string) => `rentral.listing-fee.pending.${z.uuid().parse(actorId)}.${z.uuid().parse(listingId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, listingId: string, work: () => Promise<T>): Promise<T> {
  const id = key(actorId, listingId), next = (queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(work)
  queues.set(id, next)
  void next.finally(() => { if (queues.get(id) === next) queues.delete(id) }).catch(() => undefined)
  return next
}
async function read(actorId: string, listingId: string): Promise<ListingFeeRecovery | null> {
  const id = key(actorId, listingId), value = await sessionStorage.getItem(id)
  if (value === null) {
    if (await sessionStorage.getItem(`${id}.present`) !== null) throw new Error('Publication payment recovery is incomplete. Check this listing’s server payment status before continuing.')
    return null
  }
  let json: unknown
  try { json = JSON.parse(value) } catch { throw new Error('Publication payment recovery cannot be read. Check the server payment status before continuing.') }
  const result = schema.safeParse(json)
  if (!result.success || result.data.actorId !== actorId || result.data.listingId !== listingId) throw new Error('Publication payment recovery does not match this account and listing. Check the server status before continuing.')
  return result.data
}
async function remove(actorId: string, listingId: string) {
  const id = key(actorId, listingId)
  await sessionStorage.removeItem(id); await sessionStorage.removeItem(`${id}.present`)
}
async function begin<T>(actorId: string, listingId: string, operation: 'checkout' | 'reconcile', reference: string | undefined, work: () => Promise<T>) {
  return serialized(actorId, listingId, async () => {
    if (await read(actorId, listingId)) throw new Error('Check this listing’s server payment status before another payment action. The previous action was not repeated.')
    const saved = schema.parse({ version: 1, actorId, listingId, operation, ...(reference ? { reference } : {}) }), id = key(actorId, listingId)
    await sessionStorage.setItem(`${id}.present`, '1')
    await sessionStorage.setItem(id, JSON.stringify(saved))
    return work()
  })
}
/** Restoration only reads private metadata; it never retries provider work. */
export function loadListingFeeRecovery(actorId: string, listingId: string) { return serialized(actorId, listingId, () => read(actorId, listingId)) }
export function beginPublicationCheckout(actorId: string, listingId: string) { return begin(actorId, listingId, 'checkout', undefined, () => preparePublicationCheckout(listingId, actorId)) }
export async function verifyPublicationPayment(actorId: string, listingId: string, reference: string) {
  const fee = await begin(actorId, listingId, 'reconcile', reference, () => reconcilePublicationFee(listingId, reference, actorId))
  let cleanupPending = false
  try { await serialized(actorId, listingId, () => remove(actorId, listingId)) } catch { cleanupPending = true }
  return { fee, cleanupPending }
}
/** A deliberate readback permits another action only after authoritative owner state is returned. */
export function reviewPublicationPayment(actorId: string, listingId: string) {
  return serialized(actorId, listingId, async () => {
    const fee = await loadPublicationFee(listingId, actorId)
    let cleanupPending = false
    try { await remove(actorId, listingId) } catch { cleanupPending = true }
    return { fee, cleanupPending }
  })
}

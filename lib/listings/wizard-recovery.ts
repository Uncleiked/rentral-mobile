import { z } from 'zod'
import { LISTING_METADATA_SCHEMAS, saveDraftInputSchema, saveListingInputSchema } from '../contracts/listings'

const id = z.string().uuid()
export const webListingCommandSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('draft'), listing: saveDraftInputSchema.extend({ clientId: id }).strict() }).strict(),
  z.object({ mode: z.literal('submit'), listing: saveListingInputSchema.extend({ clientId: id }).strict() }).strict(),
])
const commandMarkerSchema = z.object({ version: z.literal(1), actorId: id, command: webListingCommandSchema }).strict()
const captureMarkerSchema = z.object({ version: z.literal(1), actorId: id, id, phase: z.enum(['begin', 'finish']) }).strict()
export type WebListingCommand = z.infer<typeof webListingCommandSchema>
export type BrowserCapturePending = { id: string; phase: 'begin' | 'finish'; blob?: Blob; mime?: string; poster?: Blob | null }
export type WizardIdentity = { actorId: string; generation: number; isActive?: () => boolean }
export const commandRecoveryKey = (actorId: string) => `rentral.web-listing.request.${id.parse(actorId)}`
export const captureRecoveryKey = (actorId: string) => `rentral.web-listing.capture.${id.parse(actorId)}`

function storage(required = false): Storage | null {
  try {
    if (typeof window !== 'undefined') return window.sessionStorage
  } catch { /* Access can be disabled by the browser's privacy settings. */ }
  if (required) throw new Error('Browser recovery storage is unavailable. Enable site storage before sending a listing request.')
  return null
}
function readJson(key: string): unknown | null {
  const raw = storage()?.getItem(key)
  if (raw === null || raw === undefined) return null
  if (raw.length > 65536) throw new Error('The saved listing recovery record cannot be confirmed. Review Your Listings before explicitly clearing it.')
  try { return JSON.parse(raw) } catch { throw new Error('The saved listing recovery record cannot be read. Review Your Listings before explicitly clearing it.') }
}
export function normalizeWebListingCommand(input: unknown): WebListingCommand {
  const parsed = webListingCommandSchema.parse(input)
  // Draft history can contain unknown metadata. Persist only fields the current
  // listing form owns, excluding old GPS or other private/unrecognized keys.
  const allowed = LISTING_METADATA_SCHEMAS[parsed.listing.category].shape
  const source = parsed.listing.metadata
  const metadata = source && typeof source === 'object' && !Array.isArray(source)
    ? Object.fromEntries(Object.keys(allowed).filter(key => Object.hasOwn(source, key)).map(key => [key, Reflect.get(source, key)]).filter(([, value]) => typeof value === 'boolean' || typeof value === 'string' && value.length <= 1500)) : {}
  return webListingCommandSchema.parse({ ...parsed, listing: { ...parsed.listing, metadata } })
}
export function readWebListingCommand(actorId: string): WebListingCommand | null {
  const raw = readJson(commandRecoveryKey(actorId))
  if (raw === null) return null
  const marker = commandMarkerSchema.safeParse(raw)
  if (!marker.success || marker.data.actorId !== actorId) throw new Error('The saved listing request belongs to an unconfirmed recovery record. Review Your Listings before clearing it.')
  return marker.data.command
}
export function persistWebListingCommand(actorId: string, command: WebListingCommand): void {
  const marker = commandMarkerSchema.parse({ version: 1, actorId, command })
  const existing = readWebListingCommand(actorId)
  if (existing && JSON.stringify(existing) !== JSON.stringify(command)) throw new Error('Confirm the original saved listing request before preparing different instructions.')
  storage(true)!.setItem(commandRecoveryKey(actorId), JSON.stringify(marker))
}
export function clearWebListingCommand(actorId: string, clientId: string): void {
  const existing = readWebListingCommand(actorId)
  if (existing && existing.listing.clientId !== clientId) throw new Error('The saved listing recovery identifier changed. Reopen recovery before continuing.')
  storage(true)!.removeItem(commandRecoveryKey(actorId))
}
export function readBrowserCapturePending(actorId: string): BrowserCapturePending | null {
  const raw = readJson(captureRecoveryKey(actorId))
  if (raw === null) return null
  const marker = captureMarkerSchema.safeParse(raw)
  if (!marker.success || marker.data.actorId !== actorId) throw new Error('The saved recording recovery record cannot be confirmed. Keep it and review Your Listings.')
  return { id: marker.data.id, phase: marker.data.phase }
}
export function persistBrowserCapturePending(actorId: string, pending: BrowserCapturePending): void {
  storage(true)!.setItem(captureRecoveryKey(actorId), JSON.stringify(captureMarkerSchema.parse({ version: 1, actorId, id: pending.id, phase: pending.phase })))
}
export function clearBrowserCapturePending(actorId: string, expectedId: string): void {
  const current = readBrowserCapturePending(actorId)
  if (current && current.id !== expectedId) throw new Error('This recording recovery belongs to another take. Reopen the current recording before continuing.')
  storage(true)!.removeItem(captureRecoveryKey(actorId))
}
/** Explicit operator action only, after reviewing inventory; never on failure. */
export function discardWebRecovery(actorId: string): void {
  storage(true)!.removeItem(commandRecoveryKey(actorId)); storage(true)!.removeItem(captureRecoveryKey(actorId))
}

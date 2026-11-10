import { Directory, File, Paths } from 'expo-file-system'
import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { LISTING_CATEGORIES, saveDraftInputSchema, saveListingInputSchema, type OwnerListingDetail } from '../../../../lib/contracts/listings'
import { sessionStorage } from './session-storage'
import { EMPTY_LISTING_FORM, formFromOwnerListing, type ListingForm } from './native-listing'
import { nativeUploadSchema, prepareNativeListingUpload } from './native-upload'
import { captureStatusSchema, finishCaptureInputSchema } from '../../../../lib/contracts/capture'

const id = z.string().uuid()
const formSchema = z.record(z.string(), z.union([z.string().max(1500), z.boolean()])).superRefine((form, context) => {
  const keys = Object.keys(EMPTY_LISTING_FORM)
  if (Object.keys(form).length !== keys.length || keys.some(key => typeof form[key] !== typeof EMPTY_LISTING_FORM[key as keyof ListingForm])) context.addIssue({ code: 'custom', message: 'The device draft form is incomplete.' })
  const choices: Record<string, string[]> = { pricePeriod: ['year','month','day','trip'], rentalIntent: ['rent','buy','squat','shortlet'], hostCapacity: ['owner','agent','tenant','organization'], transmission: ['automatic','manual'], propertyType: ['','apartment','studio','room','bungalow','duplex','terrace','detached','semi-detached','other'], insuranceStatus: ['','insured','not-insured','not-provided'] }
  if (Object.entries(choices).some(([field, options]) => !options.includes(String(form[field])))) context.addIssue({ code: 'custom', message: 'The device draft choices cannot be confirmed.' })
}).transform(form => form as ListingForm)
const captureSchema = z.object({ uri: z.string().min(1).max(3000), captureId: id.optional(), lat: z.number().finite().min(-90).max(90).optional(), lng: z.number().finite().min(-180).max(180).optional(), accuracy: z.number().positive().max(100).optional(), duration: z.number().positive().max(120) }).strict()
export const nativeCaptureSessionSchema = z.object({ id, phase: z.enum(['starting', 'recording', 'finishing', 'recorded', 'sealing', 'sealed', 'interrupted', 'expired']),
  status: captureStatusSchema.nullable(), finishInput: finishCaptureInputSchema.nullable(), sealPath: z.string().max(500).nullable() }).strict()
const documentSchema = z.object({ uri: z.string().min(1).max(3000), name: z.string().max(300), mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) }).strict()
const serverSchema = z.object({ id, revision: z.number().int().nonnegative(), videoPath: z.string().max(500).nullable(), posterPath: z.string().max(500).nullable(), documentPath: z.string().max(500).nullable(), documentName: z.string().max(300).nullable(), captureId: id.nullable().optional(), hasCoords: z.boolean(), status: z.string().max(80) }).strict()
const uploadStateSchema = z.object({ upload: nativeUploadSchema, state: z.enum(['prepared', 'unknown', 'uploaded']) }).strict()
// Old pending commands are evidence of an uncertain prior request, never instructions
// to create a new unverified listing. Keep their exact payload for receipt readback.
const legacyCoordinates = { lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), accuracy: z.number().nonnegative().optional() }
export const nativeDraftCommandSchema = z.discriminatedUnion('mode', [z.object({ mode: z.literal('draft'), listing: saveDraftInputSchema.extend(legacyCoordinates).strict() }).strict(), z.object({ mode: z.literal('submit'), listing: saveListingInputSchema.extend({ ...legacyCoordinates, captureId: id.optional() }).strict() }).strict()])
export const nativeDraftSchema = z.object({ version: z.literal(1), actorId: id, localId: id, sequence: z.number().int().nonnegative(), category: z.enum(LISTING_CATEGORIES), form: formSchema,
  capture: captureSchema.nullable(), captureSession: nativeCaptureSessionSchema.nullable().optional(), document: documentSchema.nullable(), videoUpload: uploadStateSchema.nullable(), documentUpload: uploadStateSchema.nullable(),
  server: serverSchema.nullable(), pending: nativeDraftCommandSchema.nullable(), savedAt: z.string().datetime({ offset: true }) }).strict()
export type NativeDeviceDraft = z.infer<typeof nativeDraftSchema>
export type NativeDraftCommand = z.infer<typeof nativeDraftCommandSchema>
const key = (actorId: string) => `rentral.listing.draft.${id.parse(actorId)}`
const queues = new Map<string, Promise<unknown>>()
function serialize<T>(actorId: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(actorId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(work)
  queues.set(actorId, next)
  void next.finally(() => { if (queues.get(actorId) === next) queues.delete(actorId) }).catch(() => undefined)
  return next
}
export function nativeDraftDirectory(actorId: string, localId: string): Directory { return new Directory(Paths.document, 'rentral-listing-drafts', id.parse(actorId), id.parse(localId)) }
function validateFiles(draft: NativeDeviceDraft): void {
  const uris = [draft.capture?.uri, draft.document?.uri, draft.videoUpload?.upload.uri, draft.documentUpload?.upload.uri].filter((uri): uri is string => Boolean(uri))
  const prefix = uris.length ? `${nativeDraftDirectory(draft.actorId, draft.localId).uri.replace(/\/$/, '')}/` : ''
  if (uris.some(uri => !uri.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(uri.slice(prefix.length)))) throw new Error('The device draft file location cannot be confirmed. Your server drafts remain available in My listings.')
  for (const item of [draft.videoUpload, draft.documentUpload]) if (item && !item.upload.path.startsWith(`${draft.actorId}/`)) throw new Error('This device draft belongs to another upload account.')
  if (draft.pending && !draft.pending.listing.clientId) throw new Error('This saved request is missing its recovery identifier. Check My listings before dismissing it.')
  if (draft.capture?.captureId && draft.captureSession && draft.capture.captureId !== draft.captureSession.id) throw new Error('This saved walkthrough no longer matches its recording location session.')
  if (draft.captureSession?.status && draft.captureSession.status.id !== draft.captureSession.id) throw new Error('This saved location status belongs to another recording.')
  if (draft.captureSession?.sealPath && !draft.captureSession.sealPath.startsWith(`${draft.actorId}/`)) throw new Error('This recording location is bound to another upload account.')
}
async function read(actorId: string): Promise<NativeDeviceDraft | null> {
  const raw = await sessionStorage.getItem(key(actorId))
  const marker = await sessionStorage.getItem(`${key(actorId)}.present`)
  if (raw === null && marker === null) return null
  if (raw === null) throw new Error('The device draft recovery record is incomplete. Review My listings before dismissing it; no new save was sent.')
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('The device draft recovery record cannot be read. Review My listings before dismissing it.') }
  const draft = nativeDraftSchema.safeParse(parsed)
  if (!draft.success || draft.data.actorId !== actorId) throw new Error('The device draft recovery record cannot be confirmed. Review My listings before dismissing it.')
  validateFiles(draft.data)
  return draft.data
}
async function write(draft: NativeDeviceDraft): Promise<void> {
  validateFiles(draft)
  await sessionStorage.setItem(`${key(draft.actorId)}.present`, '1')
  await sessionStorage.setItem(key(draft.actorId), JSON.stringify(draft))
}
export function loadNativeDeviceDraft(actorId: string): Promise<NativeDeviceDraft | null> { return serialize(actorId, () => read(actorId)) }
export function saveNativeDeviceDraft(input: NativeDeviceDraft): Promise<NativeDeviceDraft> {
  return serialize(input.actorId, async () => {
    const next = nativeDraftSchema.parse(input)
    const previous = await read(next.actorId)
    if (previous && previous.localId !== next.localId) throw new Error('A different device draft is still saved. Resume it or review and dismiss it before starting another.')
    if (previous && previous.sequence >= next.sequence) return previous
    if (previous?.pending && JSON.stringify(previous.pending) !== JSON.stringify(next.pending)) throw new Error('Confirm the saved listing request before changing its instructions.')
    await write(next)
    return next
  })
}
export function resolveNativeDeviceDraft(actorId: string, localId: string, clientId: string, next: NativeDeviceDraft): Promise<NativeDeviceDraft> {
  return serialize(actorId, async () => {
    const previous = await read(actorId)
    if (!previous || previous.localId !== localId || previous.pending?.listing.clientId !== clientId || next.actorId !== actorId || next.localId !== localId) throw new Error('This listing recovery result no longer matches the saved request.')
    const saved = nativeDraftSchema.parse({ ...next, pending: null, sequence: Math.max(previous.sequence, next.sequence) + 1 })
    await write(saved)
    return saved
  })
}
export function dismissNativeDeviceDraft(actorId: string): Promise<boolean> {
  return serialize(actorId, async () => {
    const current = await read(actorId).catch(() => null)
    await sessionStorage.removeItem(key(actorId)); await sessionStorage.removeItem(`${key(actorId)}.present`)
    if (!current) return false
    try { const directory = nativeDraftDirectory(actorId, current.localId); if (directory.exists) directory.delete(); return false }
    catch { return true }
  })
}
export async function stashNativeDraftFile(actorId: string, localId: string, uri: string, kind: 'video' | 'document', mimeType?: string): Promise<string> {
  const prepared = prepareNativeListingUpload(uri, kind, actorId, mimeType)
  const extension = prepared.path.split('.').pop()!
  const directory = nativeDraftDirectory(actorId, localId)
  directory.create({ intermediates: true, idempotent: true })
  const destination = new File(directory, `${Crypto.randomUUID()}.${extension}`)
  await new File(uri).copy(destination)
  if (!destination.exists || destination.size !== prepared.size) throw new Error('The original file could not be kept safely on this device. Keep Rentral open and try saving it again.')
  return destination.uri
}
export function newNativeDeviceDraft(actorId: string, listing?: OwnerListingDetail): NativeDeviceDraft {
  return { version: 1, actorId: id.parse(actorId), localId: Crypto.randomUUID(), sequence: 0, category: listing?.category ?? 'house', form: listing ? formFromOwnerListing(listing) : { ...EMPTY_LISTING_FORM },
    capture: null, captureSession: null, document: null, videoUpload: null, documentUpload: null, server: listing ? serverDraftState(listing) : null, pending: null, savedAt: new Date().toISOString() }
}
export function serverDraftState(listing: OwnerListingDetail): NativeDeviceDraft['server'] {
  return { id: listing.id, revision: listing.revision, videoPath: listing.videoPath, posterPath: listing.posterPath, documentPath: listing.documentPath, documentName: listing.documentName, captureId: listing.captureId, hasCoords: listing.hasCoords, status: listing.status }
}

import { accountCloseResultSchema, accountCloseSchema, accountExportManifestSchema, accountExportPageSchema, accountExportResourceSchema, type AccountExportResource } from '../../../../lib/contracts/account-lifecycle'
import { api, ApiError } from './api'

export type ExportSink = { append: (text: string) => Promise<void> }
export async function closeNativeAccount(currentPassword: string, actorId: string) {
  const input = accountCloseSchema.safeParse({ currentPassword })
  if (!input.success) throw new ApiError('Enter your current password.', 'INVALID_INPUT', 400)
  const parsed = accountCloseResultSchema.safeParse(await api<unknown>('/account/close', { method: 'POST', body: input.data, expectedUserId: actorId }))
  if (!parsed.success) throw new ApiError('Account closure could not be confirmed. Check your sign-in before trying again.', 'INVALID_RESPONSE', 200)
  return parsed.data
}
export async function loadAccountExportManifest(actorId: string, signal?: AbortSignal) {
  const parsed = accountExportManifestSchema.safeParse(await api<unknown>('/account/export', { expectedUserId: actorId, signal }))
  if (!parsed.success || new Set(parsed.data.resources).size !== parsed.data.resources.length) throw new ApiError('The account export resources could not be confirmed.', 'INVALID_RESPONSE', 200)
  return parsed.data
}
/** Append one bounded API page at a time so native exports do not collect the whole archive in JS memory. */
export async function exportAccountResource(actorId: string, input: AccountExportResource, sink: ExportSink, onProgress: (items: number, pages: number) => void, signal?: AbortSignal) {
  const resource = accountExportResourceSchema.parse(input)
  let cursor: string | null = null, pages = 0, items = 0
  const checkAbort = () => { if (signal?.aborted) throw new ApiError('Account export cancelled.', 'CANCELLED', 0) }
  checkAbort()
  await sink.append(`{"version":1,"resource":${JSON.stringify(resource)},"exportedAt":${JSON.stringify(new Date().toISOString())},"pages":[`)
  do {
    checkAbort()
    const result = accountExportPageSchema.safeParse(await api<unknown>(`/account/export?resource=${resource}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { expectedUserId: actorId, signal }))
    checkAbort()
    if (!result.success || result.data.resource !== resource || (result.data.nextCursor && cursor && result.data.nextCursor <= cursor)) throw new ApiError('An account export page could not be confirmed. The incomplete file has not been shared.', 'INVALID_RESPONSE', 200)
    await sink.append(`${pages ? ',' : ''}${JSON.stringify(result.data)}`)
    pages++; items += result.data.items.length; cursor = result.data.nextCursor
    onProgress(items, pages)
  } while (cursor)
  checkAbort()
  await sink.append(']}')
  return { resource, items, pages }
}

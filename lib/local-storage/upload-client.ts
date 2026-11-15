import { z } from 'zod'
import { UPLOAD_PART_BYTES, uploadCapabilitiesSchema, uploadPartResultSchema } from '../contracts/upload-transport'
const capabilityEnvelope = z.object({ success: z.literal(true), data: uploadCapabilitiesSchema }).strict()
const partEnvelope = z.object({ success: z.literal(true), data: uploadPartResultSchema }).strict()
/** A lost response ends this attempt. Recovery must check status and explicitly
 * retry the same file/path; only a confirmed server prefix may be skipped. */
export async function sendBrowserStoredFile(url: string, file: Blob, input: { headers: HeadersInit; signal?: AbortSignal }): Promise<Response> {
 const headers = new Headers(input.headers), common = { credentials: 'same-origin' as const, cache: 'no-store' as const, signal: input.signal ?? AbortSignal.timeout(180000) }
 const send = (body: Blob, extra?: Headers) => fetch(url, { ...common, method: 'POST', headers: extra ?? headers, body })
 if (file.size <= UPLOAD_PART_BYTES) return send(file)
 const capability = await fetch(url.split('?')[0] + '?capabilities=1', { ...common, headers })
 if (!capability.ok) return capability
 const prepared = capabilityEnvelope.safeParse(await capability.json())
 if (!prepared.success) throw new Error('The server upload capability could not be confirmed. Keep the original file and check its status before retrying.')
 if (!prepared.data.data.chunked) return send(file)
 const totalParts = Math.ceil(file.size / UPLOAD_PART_BYTES), path = headers.get('x-upload-path'); let part = 0
 while (part < totalParts) {
  const partHeaders = new Headers(headers); partHeaders.set('X-Upload-Total-Size', String(file.size)); partHeaders.set('X-Upload-Part', String(part))
  const response = await send(file.slice(part * UPLOAD_PART_BYTES, Math.min(file.size, (part + 1) * UPLOAD_PART_BYTES)), partHeaders)
  if (!response.ok) return response
  const received = partEnvelope.safeParse(await response.clone().json())
  if (!received.success || received.data.data.path !== path || received.data.data.nextPart <= part || received.data.data.nextPart > totalParts || received.data.data.complete !== (received.data.data.nextPart === totalParts)) throw new Error('The upload part response could not be confirmed. Keep the original file and check its saved status before retrying.')
  if (received.data.data.complete) return response
  await response.body?.cancel(); part = received.data.data.nextPart
 }
 throw new Error('This upload did not reach a confirmed result. Check the original upload before retrying.')
}


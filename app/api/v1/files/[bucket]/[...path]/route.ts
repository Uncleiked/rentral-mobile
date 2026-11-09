import { createLocalStorage, defaultStorageDirectory } from '@/lib/local-storage/core'
import { storageBucket, storageFailure, storagePath, StorageError } from '@/lib/local-storage/policy'
import { verifyStorageToken } from '@/lib/local-storage/urls'
import prisma from '@/lib/db'
import { activeAccountWhere } from '@/lib/accounts/availability'

export const runtime = 'nodejs'
type Context = { params: Promise<{ bucket: string; path: string[] }> }

function byteRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return null
  const first = match[1] ? Number(match[1]) : null
  const last = match[2] ? Number(match[2]) : null
  if ((first !== null && (!Number.isSafeInteger(first) || first >= size)) || (last !== null && !Number.isSafeInteger(last))) return null
  if (first === null) return last && last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null
  if (last !== null && last < first) return null
  return { start: first, end: Math.min(size - 1, last ?? size - 1) }
}

async function fileResponse(request: Request, context: Context): Promise<Response> {
  try {
    const params = await context.params
    const bucket = storageBucket(params.bucket)
    const url = new URL(request.url)
    if (/%(?:2f|5c|00|2e)/i.test(url.pathname)) throw new StorageError(400, 'INVALID_PATH', 'This file path is invalid.')
    if (params.path.some(part => part.includes('/'))) throw new StorageError(400, 'INVALID_PATH', 'This file path is invalid.')
    const path = params.path.join('/')
    storagePath(bucket, path)
    if (bucket !== 'profile-avatars') await verifyStorageToken(url.searchParams.get('token'), bucket, path)
    else if (!await prisma.user.findFirst({ where: { id: params.path[0], ...activeAccountWhere }, select: { id: true } })) throw new StorageError(404, 'NOT_FOUND', 'This file is unavailable.')
    const storage = createLocalStorage(defaultStorageDirectory())
    const info = await storage.info(bucket, path)
    const etag = `"${info.digest}"`
    const headers: Record<string, string> = {
      'Content-Type': info.contentType, 'Content-Length': String(info.size), 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': new Date(info.createdAt).toUTCString(),
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `${bucket === 'compliance-docs' ? 'attachment' : 'inline'}; filename="${params.path.at(-1)}"`,
    }
    const requestedRange = request.method === 'GET' && (!request.headers.get('if-range') || request.headers.get('if-range') === etag) ? request.headers.get('range') : null
    const range = requestedRange ? byteRange(requestedRange, info.size) : undefined
    if (requestedRange && !range) return new Response(null, { status: 416, headers: { ...headers, 'Content-Length': '0', 'Content-Range': `bytes */${info.size}` } })
    if (range) { headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`; headers['Content-Length'] = String(range.end - range.start + 1) }
    return new Response(request.method === 'HEAD' ? null : await storage.stream(bucket, path, range ?? undefined), { status: range ? 206 : 200, headers })
  } catch (error) {
    const mapped = storageFailure(error)
    return Response.json({ success: false, error: mapped.message, code: mapped.code }, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  }
}

export async function GET(request: Request, context: Context): Promise<Response> { return fileResponse(request, context) }
export async function HEAD(request: Request, context: Context): Promise<Response> { return fileResponse(request, context) }

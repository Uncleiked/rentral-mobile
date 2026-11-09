import { Directory, File, Paths } from 'expo-file-system'
import * as Crypto from 'expo-crypto'
import { Linking, Platform } from 'react-native'
import { config } from './config'
import { nativeMediaUrl } from './media-url'

export function privateDocumentUrl(value: string, actorId: string, origin: string): string {
  const resolved = nativeMediaUrl(value, origin)
  if (!resolved) throw new Error('This private document link is unavailable. Request a fresh link.')
  const url = new URL(resolved)
  if (url.origin !== new URL(origin).origin || url.hash || !url.pathname.startsWith(`/api/v1/files/compliance-docs/${actorId}/`)
    || !url.searchParams.get('token') || [...url.searchParams.keys()].some(key => key !== 'token') || !/\.(pdf|jpe?g|png|webp)$/i.test(url.pathname)) throw new Error('This private document link could not be confirmed.')
  return url.toString()
}
export async function previewPrivateDocument(value: string, actorId: string): Promise<void> {
  const url = privateDocumentUrl(value, actorId, config.apiUrl)
  if (Platform.OS === 'web') { await Linking.openURL(url); return }
  const extension = /\.(pdf|jpe?g|png|webp)$/i.exec(new URL(url).pathname)![1].toLowerCase()
  const directory = new Directory(Paths.cache, 'rentral-private-documents', actorId)
  directory.create({ intermediates: true, idempotent: true })
  const destination = new File(directory, `${Crypto.randomUUID()}.${extension}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  let downloaded: File
  try { downloaded = await File.downloadFileAsync(url, destination, { signal: controller.signal, onProgress: progress => { if (progress.bytesWritten > 10 * 1024 * 1024) controller.abort() } }) }
  finally { clearTimeout(timer) }
  if (!downloaded.exists || downloaded.size <= 0 || downloaded.size > 10 * 1024 * 1024) throw new Error('This private document could not be downloaded within the supported limit.')
  await downloaded.preview({ title: 'Private Rentral document', mimeType: extension === 'pdf' ? 'application/pdf' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}` })
  // The OS viewer may still be reading after preview() resolves. Keep its private
  // cache file available; it is never copied into a public photo/files directory.
}

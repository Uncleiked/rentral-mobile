/** Canonical localhost URLs must use the API host reachable by the phone. */
export function nativeMediaUrl(value: string | null, apiOrigin: string): string | null {
  if (!value) return null
  try {
    const api = new URL(apiOrigin)
    const media = new URL(value, api)
    if (!['http:', 'https:'].includes(media.protocol) || media.username || media.password) return null
    if (['localhost', '127.0.0.1', '[::1]'].includes(media.hostname)) return new URL(`${media.pathname}${media.search}${media.hash}`, api).toString()
    return media.toString()
  } catch { return null }
}

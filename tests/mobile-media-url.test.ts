import { expect, it } from 'vitest'
import { nativeMediaUrl } from '../apps/mobile/src/lib/media-url'

it('preserves signed paths while using the backend host reachable from Android or a phone', () => {
  const path = '/api/v1/files/listings-media/member/take.mp4?token=signed'
  expect(nativeMediaUrl(`http://localhost:3000${path}`, 'http://10.0.2.2:3000')).toBe(`http://10.0.2.2:3000${path}`)
  expect(nativeMediaUrl(path, 'http://192.168.1.10:3000')).toBe(`http://192.168.1.10:3000${path}`)
  expect(nativeMediaUrl('https://stream.mux.com/id.m3u8?token=signed', 'http://localhost:3000')).toBe('https://stream.mux.com/id.m3u8?token=signed')
})
it('rejects non-network and credential-bearing media addresses', () => {
  expect(nativeMediaUrl('file:///private/secret', 'http://localhost:3000')).toBeNull()
  expect(nativeMediaUrl('https://user:password@example.test/file', 'http://localhost:3000')).toBeNull()
  expect(nativeMediaUrl(null, 'http://localhost:3000')).toBeNull()
})

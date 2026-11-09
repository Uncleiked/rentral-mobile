import { expect, it } from 'vitest'
import { resolveApiConfiguration, validatedApiOrigin } from '../apps/mobile/src/lib/api-config'

const development = { development: true, platform: 'android' }

it.each(['android', 'ios'])('detects a real LAN backend from the%s Expo host', platform => {
  expect(resolveApiConfiguration({ development: true, platform, hostUri: '192.168.1.10:8081' })).toEqual({ apiUrl: 'http://192.168.1.10:3000', configurationError: null })
})

it.each(['10.2.3.4:8081', '172.16.0.4:8081', '172.31.255.4:8081', '169.254.1.2:8081', 'computer.local:8081', 'computer.lan:8081', 'computer:8081', '[fd12:3456::1]:8081'])('supports local host%s without forwarding the Metro port', hostUri => {
  const result = resolveApiConfiguration({ ...development, hostUri })
  expect(result.configurationError).toBeNull()
  expect(new URL(result.apiUrl).port).toBe('3000')
})

it.each(['fixture-8081.exp.direct', 'fixture.ngrok-free.app', 'fixture.trycloudflare.com', 'https://fixture.example.test:443', '8.8.8.8:8081', '172.32.0.4:8081'])('requires an explicit backend for public/tunnel Metro host%s', hostUri => {
  const result = resolveApiConfiguration({ ...development, hostUri })
  expect(result.apiUrl).toBe('')
  expect(result.configurationError).toContain('EXPO_PUBLIC_API_URL')
  expect(result.configurationError).toContain('tunnel')
})

it.each(['android', 'ios'])('does not guess an emulator address when the%s host is absent', platform => {
  const result = resolveApiConfiguration({ development: true, platform })
  expect(result.apiUrl).toBe('')
  expect(result.configurationError).toContain('could not be detected')
})

it.each(['localhost:8081', '127.0.0.1:8081', '127.1.2.3:8081', '[::1]:8081'])('does not mistake native loopback host%s for a physical device backend', hostUri => {
  const result = resolveApiConfiguration({ ...development, hostUri })
  expect(result.apiUrl).toBe('')
  expect(result.configurationError).toContain('Android emulator')
  expect(result.configurationError).toContain('LAN address on a phone')
})

it.each(['http://10.0.2.2:3000', 'http://localhost:3000', 'http://192.168.1.10:3000', 'https://actual-backend.ngrok-free.app'])('keeps the explicit backend override%s even when Expo uses a tunnel', apiUrl => {
  expect(resolveApiConfiguration({ ...development, apiUrl, hostUri: 'fixture.exp.direct' })).toEqual({ apiUrl, configurationError: null })
})

it('keeps localhost automatic detection for a browser on the development computer', () => {
  expect(resolveApiConfiguration({ development: true, platform: 'web', webHostname: 'localhost' })).toEqual({ apiUrl: 'http://localhost:3000', configurationError: null })
  expect(resolveApiConfiguration({ development: true, platform: 'web', webHostname: '[::1]' })).toEqual({ apiUrl: 'http://[::1]:3000', configurationError: null })
})

it('requires an explicit backend when the web preview itself uses a tunnel', () => {
  expect(resolveApiConfiguration({ development: true, platform: 'web', webHostname: 'fixture.exp.direct' })).toMatchObject({ apiUrl: '', configurationError: expect.stringContaining('EXPO_PUBLIC_API_URL') })
})

it('requires an explicit HTTPS backend in release builds', () => {
  expect(resolveApiConfiguration({ development: false, platform: 'android', hostUri: '192.168.1.10:8081' }).apiUrl).toBe('')
  expect(resolveApiConfiguration({ development: false, platform: 'android', apiUrl: 'http://192.168.1.10:3000' }).apiUrl).toBe('')
  expect(resolveApiConfiguration({ development: false, platform: 'android', apiUrl: 'https://api.example.test/' })).toEqual({ apiUrl: 'https://api.example.test', configurationError: null })
})

it.each(['http://user:secret@example.test', 'https://api.example.test/api/v1', 'https://api.example.test?token=secret', 'https://api.example.test#secret', 'file:///private/token', 'not-an-origin'])('rejects unsafe backend setting%s without echoing it', apiUrl => {
  const result = resolveApiConfiguration({ ...development, apiUrl })
  expect(result.apiUrl).toBe('')
  expect(result.configurationError).not.toContain('secret')
  expect(result.configurationError).toContain('EXPO_PUBLIC_API_URL')
  expect(validatedApiOrigin(apiUrl, true)).toBeNull()
})

it.each(['file://computer/private', 'http://user:secret@computer:8081', 'http://[broken', '0.0.0.0:8081'])('rejects unusable or malformed Metro host%s', hostUri => {
  expect(resolveApiConfiguration({ ...development, hostUri }).apiUrl).toBe('')
})

it('normalizes an explicit clean origin and never appends API paths to it', () => {
  expect(resolveApiConfiguration({ ...development, apiUrl: '  https://API.EXAMPLE.TEST:443/  ' })).toEqual({ apiUrl: 'https://api.example.test', configurationError: null })
})

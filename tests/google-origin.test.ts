import { expect, it } from 'vitest'
import { googleCallbackOrigin } from '@/lib/auth/google-origin'

it('accepts the exact configured public origin', () => {
  expect(googleCallbackOrigin(new Request('https://rentral.example/auth/google/callback'), 'https://rentral.example', false)).toBe('https://rentral.example')
})
it.each(['0.0.0.0', '127.0.0.1', 'localhost'])('accepts a local Next bind URL %s only with the exact browser Host', bind => {
  const request = new Request(`http://${bind}:3000/auth/google/callback`, { headers: { host: 'localhost:3000' } })
  expect(googleCallbackOrigin(request, 'http://localhost:3000', false)).toBe('http://localhost:3000')
})
it('permits the Vercel HTTPS edge over an internal HTTP URL with an exact configured Host', () => {
  const request = new Request('http://127.0.0.1:3000/auth/google/callback', { headers: { host: 'rentral.vercel.app', 'x-forwarded-proto': 'https' } })
  expect(googleCallbackOrigin(request, 'https://rentral.vercel.app', true)).toBe('https://rentral.vercel.app')
  expect(() => googleCallbackOrigin(request, 'https://rentral.vercel.app', false)).toThrow()
})
const invalidCases: { url: string; headers: Record<string, string> }[] = [
  { url: 'http://0.0.0.0:3000/auth/google/callback', headers: {} },
  { url: 'http://0.0.0.0:3000/auth/google/callback', headers: { host: 'attacker.invalid', 'x-forwarded-host': 'localhost:3000' } },
  { url: 'http://attacker.invalid/auth/google/callback', headers: { host: 'localhost:3000' } },
  { url: 'http://localhost:3000/auth/google/callback', headers: { host: 'attacker.invalid' } },
]
it.each(invalidCases)('rejects missing, mismatched or forged hosts without using forwarded-host headers: %j', ({ url, headers }) => {
  expect(() => googleCallbackOrigin(new Request(url, { headers }), 'http://localhost:3000', false)).toThrow()
})
it('rejects downgraded HTTPS or an unconfirmed proxy protocol', () => {
  for (const protocol of [undefined, 'http', 'https,http']) {
    const request = new Request('http://127.0.0.1:3000/auth/google/callback', { headers: { host: 'rentral.vercel.app', ...(protocol ? { 'x-forwarded-proto': protocol } : {}) } })
    expect(() => googleCallbackOrigin(request, 'https://rentral.vercel.app', true)).toThrow()
  }
})

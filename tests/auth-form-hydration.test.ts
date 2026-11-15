import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(auth)/sign-in/actions', () => ({ login: vi.fn(), signup: vi.fn() }))
vi.mock('@/app/auth/google/actions', () => ({ startGoogleSignIn: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
import AuthForm from '@/app/(auth)/sign-in/AuthForm'
import { GoogleFinishForm } from '@/app/auth/google/finish/GoogleFinishForm'

describe('credential form before hydration', () => {
  it('uses POST for native submission so passwords cannot enter a query string', () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { providers: { google: false, apple: false } }))
    expect(html.match(/<form\b[^>]*>/)?.[0]).toContain('method="post"')
    expect(html).toContain('name="password"')
  })
  it('keeps submission disabled until its client handlers are ready', () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { providers: { google: true, apple: false } }))
    expect(html.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
  })
})

it('requires a username for a new Google account and keeps its POST submit disabled before hydration', () => {
  const html = renderToStaticMarkup(createElement(GoogleFinishForm, { kind: 'new', email: 'member@example.test' }))
  expect(html.match(/<form\b[^>]*>/)?.[0]).toContain('method="post"')
  expect(html.match(/<input\b[^>]*name="username"[^>]*>/)?.[0]).toContain('required=""')
  expect(html).toContain('aria-describedby="google-username-help"')
  expect(html.match(/<button\b[^>]*>/)?.[0]).toContain('disabled=""')
  const existing = renderToStaticMarkup(createElement(GoogleFinishForm, { kind: 'link', email: 'member@example.test' }))
  expect(existing).not.toContain('name="username"')
  expect(existing).toContain('name="password"')
})

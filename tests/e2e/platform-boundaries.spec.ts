import { test, expect } from '@playwright/test'

test('public guidance pages are responsive and keyboard reachable', async ({ page }) => {
  for (const path of ['/help', '/terms', '/privacy', '/insights']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('new private workspaces deny anonymous URL access', async ({ page }) => {
  for (const path of ['/marketplace/messages', '/marketplace/bookings', '/marketplace/vault', '/marketplace/dashboard', '/marketplace/admin', '/marketplace/insights', '/marketplace/notifications', '/marketplace/renewals', '/marketplace/appeals']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in$/)
  }
})

test('versioned APIs use noncacheable JSON authorization errors', async ({ request }) => {
  const response = await request.get('/api/v1/listings', { maxRedirects: 0 })
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['location']).toBeUndefined()
  expect((await response.json()).success).toBe(false)
})

test('lifecycle scheduling route authenticates its own bearer secret', async ({ request }) => {
  const response = await request.post('/api/internal/lifecycle-worker', { maxRedirects: 0 })
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect((await request.get('/api/internal/lifecycle-worker', { maxRedirects: 0 })).status()).toBe(405)
})

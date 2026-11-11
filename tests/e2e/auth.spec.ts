import { test, expect } from '@playwright/test'

test('homepage fits the viewport and shows its brand', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true })
})

test('sign-in and password recovery remain usable at this viewport', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Welcome to Rentral' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('sign-in.png'), fullPage: true })
  await page.getByRole('link', { name: 'Forgot Password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByRole('button', { name: 'Request reset code', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('forgot-password.png'), fullPage: true })
  await page.goto('/reset-password')
  await expect(page.getByLabel('New Password', { exact: true })).toBeVisible()
  // Deliberately malformed input is rejected before any MongoDB lookup or write.
  await page.getByLabel('Reset code', { exact: true }).fill('!'.repeat(43))
  await page.getByLabel('New Password', { exact: true }).fill('new-test-password')
  await page.getByLabel('Confirm New Password').fill('new-test-password')
  await page.getByRole('button', { name: 'Update Password' }).click()
  await expect(page.getByText('This reset code has expired, has already been used, or could not be checked.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('private routes redirect anonymous visitors', async ({ page }) => {
  await page.goto('/marketplace/listing/create')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Welcome to Rentral' })).toBeVisible()
})

test('email login handles keyboard submission and recovers after network failure', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/sign-in')
  await page.getByLabel('Email', { exact: true }).fill('test@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  let submissions = 0
  await page.route('**/sign-in', async route => {
    if (route.request().method() === 'POST') {
      submissions += 1
      return route.abort('connectionfailed')
    }
    return route.continue()
  })
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to connect.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect.poll(() => submissions).toBe(2)
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('unconfigured Mux webhook is unavailable without touching media tables', async ({ request }) => {
  test.skip(process.env.MUX_ENABLED === 'true', 'This guard verifies the default disabled rollout.')
  const response = await request.post('/api/webhooks/mux', { data: {} })
  expect(response.status()).toBe(503)
})

test('media worker denies anonymous access without redirecting to sign-in', async ({ request }) => {
  const response = await request.post('/api/internal/media-worker', { maxRedirects: 0 })
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(await response.json()).toEqual({ success: false, error: 'Unauthorized.' })
  expect((await request.get('/api/internal/media-worker', { maxRedirects: 0 })).status()).toBe(405)
})

test('private media returns a non-cacheable unauthorized response to anonymous viewers', async ({ request }) => {
  const response = await request.get('/api/listings/27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d/source?kind=video', { maxRedirects: 0 })
  expect(response.status()).toBe(401)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['location']).toBeUndefined()
})

test('email and Google alternatives coexist and new accounts choose their type before submission', async ({ page }, info) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()
  const individual = page.getByRole('radio', { name: /Individual/ })
  const organization = page.getByRole('radio', { name: /Organization/ })
  await expect(individual).not.toBeChecked()
  await expect(organization).not.toBeChecked()
  let submissions = 0
  await page.route('**/sign-in', async route => {
    if (route.request().method() === 'POST') { submissions += 1; return route.abort('blockedbyclient') }
    return route.continue()
  })
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-password-123')
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()
  expect(await individual.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true)
  expect(submissions).toBe(0)
  await organization.check()
  await page.getByRole('checkbox', { name: /I accept the/ }).check()
  await expect(organization).toBeChecked()
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('account-type-and-sign-in-options.png'), fullPage: true })
  expect(submissions).toBe(0)
})

test('organization enrollment and review deny anonymous access', async ({ page, request }) => {
  await page.goto('/onboarding/organization')
  await expect(page).toHaveURL(/\/sign-in$/)
  for (const path of ['/api/v1/organizations/me', '/api/v1/admin/organizations']) {
    const result = await request.get(path, { maxRedirects: 0 })
    expect(result.status()).toBe(401)
    expect(result.headers()['cache-control']).toBe('private, no-store')
    expect((await result.json()).success).toBe(false)
  }
})
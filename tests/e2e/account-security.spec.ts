import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { accountSecuritySchema, accountSessionsSchema } from '../../lib/contracts/account-security'

const fixturePath = process.env.RENTRAL_FINANCIAL_UI_FIXTURE
const fixture: { origin: string; accessToken: string; refreshToken: string; actorId: string; email: string } | null = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null
test.skip(!fixture, 'Run through the owned localhost HTTP fixture.')

test('account security handles uncertain email delivery, independent codes, session controls and narrow layouts', async ({ page, context }, testInfo) => {
  if (!fixture) throw new Error('Owned fixture required')
  const origin = new URL(fixture.origin)
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname)
  await context.addCookies([{ name: 'rentral_access', value: fixture.accessToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' },
    { name: 'rentral_refresh', value: fixture.refreshToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' }])
  const id = '22222222-2222-4222-8222-222222222222', currentId = '33333333-3333-4333-8333-333333333333', otherId = '44444444-4444-4444-8444-444444444444'
  const now = new Date().toISOString(), later = new Date(Date.now() + 900000).toISOString()
  const account: { email: string; delivery: 'email'; emailChange: { id: string; newEmail: string; oldConfirmed: boolean; newConfirmed: boolean; expiresAt: string } | null } = { email: fixture.email, delivery: 'email', emailChange: null }
  let sessions = [{ id: currentId, createdAt: now, expiresAt: later, current: true }, { id: otherId, createdAt: now, expiresAt: later, current: false }]
  let emailCommands = 0, confirmations = 0, passwordCommands = 0
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // Main documents/assets use normal navigation; every API write remains intercepted.
  await page.route(url => url.origin !== origin.origin, route => route.abort('blockedbyclient'))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin.origin) return route.abort('blockedbyclient')
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    if (url.pathname === '/api/v1/auth/account') return reply(accountSecuritySchema.parse(account))
    if (url.pathname === '/api/v1/auth/sessions' && request.method() === 'GET') return reply(accountSessionsSchema.parse({ items: sessions, nextCursor: null }))
    if (url.pathname === '/api/v1/auth/email-change' && request.method() === 'POST') {
      expect(request.headers()['x-rentral-account']).toBe(fixture.actorId)
      expect(request.postDataJSON()).toMatchObject({ newEmail: 'new-mailbox@fixture.invalid', currentPassword: 'owned-test-current-password' })
      emailCommands += 1
      account.emailChange = { id, newEmail: 'new-mailbox@fixture.invalid', oldConfirmed: false, newConfirmed: false, expiresAt: later }
      return route.abort('failed') // The request committed; the browser must read status instead of claiming delivery.
    }
    if (url.pathname === '/api/v1/auth/email-change' && request.method() === 'DELETE') { account.emailChange = null; return reply({ cancelled: true }) }
    if (url.pathname === '/api/v1/auth/email-change/confirm') {
      expect(request.postDataJSON()).toEqual({ token: 'A'.repeat(43) })
      confirmations += 1
      if (account.emailChange) account.emailChange.oldConfirmed = true
      return reply({ status: account.emailChange ? 'waiting' : 'completed', signInRequired: !account.emailChange })
    }
    if (url.pathname === `/api/v1/auth/sessions/${otherId}` && request.method() === 'DELETE') {
      sessions = sessions.filter(session => session.id !== otherId)
      return reply({ revoked: true, current: false })
    }
    if (url.pathname === '/api/v1/auth/password' && request.method() === 'POST') {
      expect(request.headers()['x-rentral-account']).toBe(fixture.actorId)
      passwordCommands += 1
      const input = request.postDataJSON()
      if (input.currentPassword === 'wrong-password') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'CURRENT_PASSWORD_INCORRECT', error: 'Your current password is incorrect.' }) })
      expect(input).toEqual({ currentPassword: 'owned-test-current-password', newPassword: 'owned-test-replacement-password' })
      await context.clearCookies()
      return reply({ changed: true, signInRequired: true })
    }
    if (url.pathname === '/api/v1/auth/web-session' && request.method() === 'GET') return reply({ user: { id: fixture.actorId, email: fixture.email, is_anonymous: false, user_metadata: {}, app_metadata: { role: 'admin' } } })
    errors.push(`Unexpected owned browser request: ${request.method()} ${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${fixture.origin}/marketplace/profile`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const security = page.locator('#account-security')
  await expect(security.getByRole('heading', { name: 'Account security', exact: true })).toBeVisible({ timeout: 90000 })
  await expect(security.getByText(fixture.email, { exact: true })).toBeVisible()
  await security.getByRole('button', { name: 'Sign out session', exact: true }).click()
  await expect(security.getByText('Another session', { exact: true })).toHaveCount(0)
  await security.getByLabel('New email address', { exact: true }).fill('new-mailbox@fixture.invalid')
  await security.getByLabel('Password to authorize email change').fill('owned-test-current-password')
  await security.getByRole('button', { name: 'Request email change', exact: true }).click()
  await expect(security.getByRole('alert')).toContainText('could not be confirmed')
  expect(emailCommands).toBe(1)
  await security.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await expect(security.getByText('Requested address: new-mailbox@fixture.invalid', { exact: true })).toBeVisible()
  expect(emailCommands).toBe(1)
  await security.getByLabel('Confirmation code', { exact: true }).fill('A'.repeat(43))
  await security.getByRole('button', { name: 'Confirm this inbox', exact: true }).click()
  await expect(security.getByText('One address is confirmed.', { exact: false })).toBeVisible()
  await expect(security.getByText('Current inbox: confirmed.', { exact: false })).toBeVisible()
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: testInfo.outputPath(`account-security-${width}.png`), fullPage: true })
    const layout = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll<HTMLElement>('main *')].filter(element => {
      const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1)
    }).slice(0, 10).map(element => ({ tag: element.tagName, classes: element.className, right: Math.round(element.getBoundingClientRect().right) })) }))
    expect(layout.overflowing).toEqual([])
    expect(layout.page).toBeLessThanOrEqual(layout.width + 1)
  }
  await security.getByRole('button', { name: 'Cancel email change', exact: true }).click()
  await expect(security.getByRole('button', { name: 'Request email change', exact: true })).toBeVisible()
  await security.getByLabel('Current password', { exact: true }).fill('wrong-password')
  await security.getByLabel('New password', { exact: true }).fill('owned-test-replacement-password')
  await security.getByLabel('Confirm new password', { exact: true }).fill('owned-test-replacement-password')
  await security.getByRole('button', { name: 'Update password and sign out', exact: true }).click()
  await expect(security.getByRole('alert')).toHaveText('Your current password is incorrect.')
  await security.getByLabel('Current password', { exact: true }).fill('owned-test-current-password')
  await security.getByRole('button', { name: 'Update password and sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  expect(passwordCommands).toBe(2)
  await page.goto(`${fixture.origin}/confirm-email`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Confirm your email change', exact: true })).toBeVisible()
  await page.getByLabel('Confirmation code', { exact: true }).fill('A'.repeat(43))
  await page.getByRole('button', { name: 'Confirm this inbox', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Both email addresses are confirmed.')
  expect(confirmations).toBe(2)
  expect(errors).toEqual([])
})

import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { ownMatchProfileSchema, matchCandidateSchema, matchConnectionSchema } from '../../lib/matching/contracts'

// The owned localhost harness supplies only its synthetic account session.
// Never load the real application environment or a configured member session.
const path = process.env.RENTRAL_FINANCIAL_UI_FIXTURE
const fixture: { origin: string; accessToken: string; refreshToken: string } | null = path ? JSON.parse(readFileSync(path, 'utf8')) : null
test.skip(!fixture, 'Run through the owned localhost HTTP fixture.')

test('matching opt-in, bounded discovery and ambiguous message readback preserve privacy across phone layouts', async ({ page, context }, testInfo) => {
  test.setTimeout(180000)
  if (!fixture) throw new Error('Owned fixture required')
  const origin = new URL(fixture.origin)
  expect(['localhost', '127.0.0.1']).toContain(origin.hostname)
  await context.addCookies([
    { name: 'rentral_access', value: fixture.accessToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' },
    { name: 'rentral_refresh', value: fixture.refreshToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' },
  ])
  const ownId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222'
  const contactId = '33333333-3333-4333-8333-333333333333', messageId = '44444444-4444-4444-8444-444444444444'
  const now = new Date().toISOString(), pageErrors: string[] = [], commands: unknown[] = []
  const base = { bio: 'A calm home and shared expectations.', neighborhoods: ['yaba'], monthlyMinKobo: '10000000', monthlyMaxKobo: '20000000', smoking: 'flexible', pets: 'flexible', guests: 'flexible', quietHours: 'flexible', currency: 'NGN', avatarUrl: null }
  let profile = ownMatchProfileSchema.parse({ ...base, id: ownId, username: 'fixture_member', isVisible: false, moderationStatus: 'clear', moderationReason: null, createdAt: now, updatedAt: now })
  const candidate = matchCandidateSchema.parse({ ...base, id: otherId, username: 'fixture_neighbor', overlap: { score: 85, reasons: ['Shared areas: Yaba.', 'Your stated monthly budget ranges overlap.'], sharedAreas: ['yaba'], budgetOverlap: { minKobo: '10000000', maxKobo: '20000000' } } })
  const other = { ...base, id: otherId, username: 'fixture_neighbor' }
  const contact = matchConnectionSchema.parse({ id: contactId, status: 'accepted', requestedByMe: true, other, acceptedAt: now, createdAt: now, updatedAt: now, lastActivityAt: now, otherReadAt: null, unread: false, lastMessage: null })
  let submitted: { id: string; clientId: string; own: boolean; body: string; createdAt: string } | null = null, blocked = false, reportSaved = false
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin.origin) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/v1/squat-mates')) return route.continue()
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    const list = (items: unknown[]) => ({ items, nextCursor: null, limit: 20 })
    const fail = () => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'NOT_FOUND', error: 'This Squat-Mates contact is unavailable.' }) })
    if (url.pathname.endsWith('/profile')) {
      if (request.method() === 'PUT') { profile = ownMatchProfileSchema.parse({ ...profile, ...request.postDataJSON() }); expect(request.postDataJSON()).not.toHaveProperty('user_id') }
      return reply({ profile, canDiscover: profile.isVisible })
    }
    if (url.pathname === '/api/v1/squat-mates') return reply(list(blocked ? [] : [candidate]))
    if (url.pathname === '/api/v1/squat-mates/connections') return request.method() === 'POST' ? reply({ id: contactId }, 201) : reply(list(blocked ? [] : [contact]))
    if (url.pathname.endsWith('/report-context')) return reply({ profileId: otherId, connectionId: contactId })
    if (url.pathname.endsWith('/messages')) {
      if (blocked) return fail()
      if (request.method() === 'POST') { const command = request.postDataJSON(); commands.push(command); submitted = { id: messageId, clientId: command.clientId, own: true, body: command.body, createdAt: now }; return route.abort('failed') }
      return reply(list(submitted ? [submitted] : []))
    }
    if (url.pathname.endsWith('/read')) return reply({ readAt: now })
    if (url.pathname === `/api/v1/squat-mates/connections/${contactId}`) return blocked ? fail() : reply(contact)
    if (url.pathname === `/api/v1/squat-mates/blocks/${otherId}`) { blocked = request.method() === 'PUT'; return reply({ blocked }) }
    if (url.pathname === '/api/v1/squat-mates/blocks') return reply(list(blocked ? [{ id: messageId, profileId: otherId, username: 'fixture_neighbor', createdAt: now }] : []))
    if (url.pathname === '/api/v1/squat-mates/reports') {
      if (request.method() === 'POST') { reportSaved = true; expect(request.postDataJSON()).toMatchObject({ profileId: otherId, connectionId: contactId }); return reply({ id: messageId }, 201) }
      return reply(list(reportSaved ? [{ id: messageId, reason: 'A fixture-only concern retained after the contact was blocked.', status: 'open', createdAt: now, reviewedAt: null, resolution: null }] : []))
    }
    throw new Error(`Unexpected matching fixture request: ${request.method()} ${url.pathname}`)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${fixture.origin}/marketplace/squat-mates`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Your matching preferences' })).toBeVisible()
  await expect(page.getByLabel('Show my profile', { exact: false })).not.toBeChecked()
  await page.getByRole('button', { name: 'Find people', exact: true }).click()
  await expect(page.getByText('Save your preferences and explicitly choose', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Your preferences', exact: true }).click()
  await page.getByLabel('Show my profile', { exact: false }).check()
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(page.getByText('Preferences saved.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Find people', exact: true }).click()
  await expect(page.getByRole('heading', { name: '@fixture_neighbor', exact: true })).toBeVisible()
  await expect(page.getByText('85/100 overlap', { exact: true })).toBeVisible()
  for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
  await page.getByRole('button', { name: 'Request a conversation' }).click()
  await page.waitForURL(`**/marketplace/squat-mates/connections/${contactId}`, { timeout: 60000 })
  await expect(page.getByLabel('Your message')).toBeVisible({ timeout: 30000 })
  await page.getByLabel('Your message').fill('A fixture-only message whose response will be lost.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByText('Your message is in the conversation.', { exact: true })).toBeVisible({ timeout: 15000 })
  expect(commands).toHaveLength(1)
  await expect(page.getByLabel('Your message')).toHaveValue('')
  await page.getByRole('button', { name: 'Block contact', exact: true }).click()
  await expect(page.getByText('This Squat-Mates contact is unavailable.', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('A fixture-only message whose response will be lost.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Report this profile', exact: true }).click()
  await page.getByLabel('Describe your concern').fill('A fixture-only concern retained after the contact was blocked.')
  await page.getByRole('button', { name: 'Send private report', exact: true }).click()
  await expect(page.getByText('Your private report was received.', { exact: false })).toBeVisible()
  expect(reportSaved).toBe(true); expect(commands).toHaveLength(1); expect(pageErrors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('matching-private-redress.png'), fullPage: true })
})

import { readFileSync } from 'node:fs'
import { expect, test, type BrowserContext } from '@playwright/test'

const fixturePath = process.env.RENTRAL_FINANCIAL_UI_FIXTURE
const fixture: { origin: string; accessToken: string; refreshToken: string; actorId: string; email: string; draftId: string } | null = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null
test.skip(!fixture?.draftId, 'Run through the owned localhost browser fixture with its synthetic draft.')
async function enter(context: BrowserContext) {
  if (!fixture || !['127.0.0.1','localhost'].includes(new URL(fixture.origin).hostname)) throw new Error('Owned localhost fixture required')
  await context.addCookies([{ name: 'rentral_access', value: fixture.accessToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' }, { name: 'rentral_refresh', value: fixture.refreshToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' }])
  return fixture
}
test('typed web draft fields survive a lost acknowledgment/reload and recover through the original receipt without replay', async ({ page, context }, info) => {
  const data = await enter(context), commands: Record<string, unknown>[] = [], errors: string[] = []
  const key = `rentral.web-listing.request.${data.actorId}`, now = new Date().toISOString()
  let committed: { mode: string; listing: Record<string, unknown> } | null = null
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== data.origin) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) })
    if (url.pathname === '/api/v1/auth/web-session') return reply({ user: { id: data.actorId, email: data.email, is_anonymous: false, app_metadata: {}, user_metadata: {} } })
    expect(request.headers()['x-rentral-account']).toBe(data.actorId)
    if (url.pathname === '/api/v1/my-listings' && request.method() === 'POST') {
      committed = request.postDataJSON(); commands.push(committed as unknown as Record<string, unknown>)
      expect(committed!.listing).toMatchObject({ draftId: data.draftId, address: 'Freshly typed current address, Yaba, Lagos', basePrice: '900000', metadata: { listingTitle: 'Freshly typed draft title', bedrooms: '4' } })
      expect(committed!.listing).not.toHaveProperty('lat'); expect(committed!.listing).not.toHaveProperty('lng')
      return route.abort('failed')
    }
    if (url.pathname.startsWith('/api/v1/my-listings/requests/')) {
      expect(request.method()).toBe('GET'); expect(committed).not.toBeNull(); expect(url.pathname.split('/').at(-1)).toBe(committed!.listing.clientId)
      return reply({ id: data.draftId, status: 'draft' })
    }
    if (url.pathname === `/api/v1/my-listings/${data.draftId}`) return reply({ id: data.draftId, revision: 1, category: 'house', status: 'draft', address: committed!.listing.address, basePrice: committed!.listing.basePrice, metadata: committed!.listing.metadata, wizardStep: 'details', videoPath: null, posterPath: null, documentPath: null, documentName: null, captureId: null, hasCoords: false, createdAt: now, updatedAt: now, archivedAt: null, actions: { edit: false, resume: true, archive: true, restore: false } })
    errors.push(`Unexpected controlled listing request: ${request.method()} ${url.pathname}`); return route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`${data.origin}/marketplace/listing/create?draft=${data.draftId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await expect(page.getByRole('heading', { name: 'Asset details', exact: true })).toBeVisible({ timeout: 90000 })
  await page.getByLabel('Listing title', { exact: true }).fill('Freshly typed draft title')
  await page.getByLabel('Address', { exact: true }).fill('Freshly typed current address, Yaba, Lagos')
  await page.getByLabel('Base price (NGN)', { exact: true }).fill('900000')
  await page.getByLabel('Bedrooms', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Save Draft & Exit', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the saved listing request', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check original request result', exact: true })).toBeEnabled()
  expect(commands).toHaveLength(1)
  const marker = await page.evaluate(key => sessionStorage.getItem(key), key)
  expect(marker).toContain('Freshly typed current address'); expect(marker).not.toMatch(/access_token|latitude|longitude|hardware_coordinates/)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Confirm the saved listing request', exact: true })).toBeVisible({ timeout: 90000 })
  expect(commands).toHaveLength(1); expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBe(marker)
  await expect(page.getByRole('button', { name: 'Save Draft & Exit', exact: true })).toBeDisabled()
  for (const width of [320,390,768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(`listing-recovery-${width}.png`), fullPage: true }) }
  await page.getByRole('button', { name: 'Check original request result', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the saved listing request', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('Freshly typed current address, Yaba, Lagos')
  await expect(page.getByLabel('Bedrooms', { exact: true })).toHaveValue('4')
  expect(commands).toHaveLength(1); expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull(); expect(errors).toEqual([])
})

test('restored pending web submit requires404 readback before exact retry and preserves its original nonce/body', async ({ page, context }) => {
  const data = await enter(context), nonce = '77777777-7777-4777-8777-777777777777', captureId = '88888888-8888-4888-8888-888888888888', listingId = '99999999-9999-4999-8999-999999999999'
  const now = new Date().toISOString(), key = `rentral.web-listing.request.${data.actorId}`
  const command = { mode: 'submit', listing: { clientId: nonce, category: 'house', address: 'Owned pending address, Yaba, Lagos', basePrice: '900000', metadata: { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' }, captureId, videoPath: `${data.actorId}/fixture/video.mp4`, documentPath: `${data.actorId}/fixture/proof.pdf` } }
  await context.addInitScript(({ key, actorId, command }) => { if (!sessionStorage.getItem('listing-recovery-seeded')) { sessionStorage.setItem(key, JSON.stringify({ version: 1, actorId, command })); sessionStorage.setItem('listing-recovery-seeded', '1') } }, { key, actorId: data.actorId, command })
  let posts = 0, reads = 0
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== data.origin) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) })
    if (url.pathname === '/api/v1/auth/web-session') return reply({ user: { id: data.actorId, email: data.email, is_anonymous: false, app_metadata: {}, user_metadata: {} } })
    expect(request.headers()['x-rentral-account']).toBe(data.actorId)
    if (url.pathname === `/api/v1/my-listings/requests/${nonce}`) { reads += 1; return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'No original request found.', code: 'REQUEST_NOT_FOUND' }) }) }
    if (url.pathname === `/api/v1/captures/${captureId}`) { expect(request.method()).toBe('GET'); return reply({ id: captureId, status: 'sealed', startedAt: now, finishBy: new Date(Date.now()+180000).toISOString(), finishedAt: now, sealBy: new Date(Date.now()+86400000).toISOString(), videoPath: command.listing.videoPath, listingId: null }) }
    if (url.pathname === '/api/v1/my-listings') { expect(request.method()).toBe('POST'); posts += 1; expect(reads).toBe(1); expect(request.postDataJSON()).toEqual(command); return reply({ id: listingId, status: 'pending_verification' }) }
    if (url.pathname === `/api/v1/my-listings/${listingId}`) return reply({ id: listingId, revision: 1, category: 'house', status: 'pending_verification', address: command.listing.address, basePrice: command.listing.basePrice, metadata: command.listing.metadata, wizardStep: null, videoPath: command.listing.videoPath, posterPath: null, documentPath: command.listing.documentPath, documentName: 'proof.pdf', captureId, hasCoords: true, createdAt: now, updatedAt: now, archivedAt: null, actions: { edit: true, resume: false, archive: true, restore: false } })
    throw new Error(`Unexpected controlled listing recovery request ${url.pathname}`)
  })
  await page.goto(`${data.origin}/marketplace/listing/create`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await expect(page.getByRole('heading', { name: 'Confirm the saved listing request', exact: true })).toBeVisible({ timeout: 90000 })
  expect(posts).toBe(0); await expect(page.getByRole('button', { name: 'Retry exact saved request', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Check original request result', exact: true }).click()
  await page.getByRole('button', { name: 'Retry exact saved request', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Listing saved', exact: true })).toBeVisible()
  expect(posts).toBe(1); expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull()
})

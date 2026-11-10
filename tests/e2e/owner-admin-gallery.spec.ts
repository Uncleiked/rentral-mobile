import { readFileSync } from 'node:fs'
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { adminDashboardSchema, type AdminCommand } from '../../lib/contracts/admin'

type Session = { accessToken: string; refreshToken: string; actorId: string; email: string }
type BrowserFixture = Session & { origin: string; galleryDraftId: string; galleryOwner: Session }
const fixtureFile = process.env.RENTRAL_FINANCIAL_UI_FIXTURE
const fixture: BrowserFixture | null = fixtureFile ? JSON.parse(readFileSync(fixtureFile, 'utf8')) : null
test.skip(!fixture?.galleryOwner || !fixture.galleryDraftId, 'Run with the separate synthetic gallery owner in the owned localhost fixture.')

async function enter(context: BrowserContext) {
  if (!fixture || !['127.0.0.1', 'localhost'].includes(new URL(fixture.origin).hostname)) throw new Error('Owned loopback gallery fixture required')
  const data = { ...fixture.galleryOwner, origin: fixture.origin, galleryDraftId: fixture.galleryDraftId }
  await context.addCookies([{ name: 'rentral_access', value: data.accessToken, url: data.origin, httpOnly: true, sameSite: 'Lax' }, { name: 'rentral_refresh', value: data.refreshToken, url: data.origin, httpOnly: true, sameSite: 'Lax' }])
  return data
}
async function layouts(page: Page, info: TestInfo, name: string) {
  for (const width of [320,390,768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`).toBe(true)
    await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true })
  }
}

test('owner self-waiver requires an explicit override and a lost decision acknowledgement recovers without replay', async ({ page, context }, info) => {
  const data = await enter(context), errors: string[] = [], outbound: string[] = [], commands: AdminCommand[] = []
  const auditId = '11111111-1111-4111-8111-111111111111', inspectionId = '22222222-2222-4222-8222-222222222222'
  const renterId = '33333333-3333-4333-8333-333333333333', hostId = '44444444-4444-4444-8444-444444444444'
  const now = new Date().toISOString(), markerKey = `rentral.admin.command.${data.actorId}`
  const dashboard = adminDashboardSchema.parse({ role: 'owner', permissions: ['staff:workspace', 'listing:review', 'listing:waive', 'user:manage', 'staff:manage', 'gallery:manage', 'owner:transfer', 'inspection:review', 'operations:read', 'finance:review', 'safety:review', 'ad:review', 'insights:view'],
    listings: [{ id: data.galleryDraftId, revision: 4, category: 'house', title: 'Synthetic owner gallery home', address: '14 Fixture Street, Bariga, Lagos', status: 'pending_verification', source: 'approved_gallery', archived: false, createdAt: now,
      lister: { id: data.actorId, username: 'gallery_owner' }, document: { present: true, status: 'approved', approvalMatches: true }, media: { hasVideo: false, photoCount: 1, status: null }, locationStatus: null, fee: { waived: false, paid: false } }],
    users: [{ id: data.actorId, revision: 1, email: data.email, username: 'gallery_owner', role: 'owner', suspended: false, closed: false, galleryAllowed: true, galleryPermissionRevision: 1, createdAt: now }],
    inspections: [{ id: inspectionId, revision: 0, listingId: data.galleryDraftId, status: 'pending', evidence: 'Both participants supplied visit evidence for an independent administrative decision.', requestedBy: renterId, requestedAt: now, renterId, hostId, startsAt: now }], audit: [] })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== data.origin) { outbound.push(url.origin); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) })
    if (url.pathname === '/api/v1/auth/web-session') return reply({ user: { id: data.actorId, email: data.email, is_anonymous: false, app_metadata: {}, user_metadata: {} } })
    expect(request.headers()['x-rentral-account']).toBe(data.actorId)
    if (url.pathname === '/api/v1/admin' && request.method() === 'GET') return reply(dashboard)
    if (url.pathname === '/api/v1/admin/commands' && request.method() === 'POST') {
      const command = request.postDataJSON() as AdminCommand
      commands.push(command)
      if (command.operation === 'waive_fee') {
        expect(commands).toHaveLength(1)
        expect(command).toMatchObject({ targetId: data.galleryDraftId, expectedRevision: 4, ownerOverride: true, reason: 'Owner waiver for this synthetic property after reviewing the publication terms.' })
        dashboard.listings[0].fee.waived = true; dashboard.listings[0].revision += 1
        dashboard.audit.push({ id: auditId, action: 'waive_fee', targetType: 'listing', targetId: data.galleryDraftId, reason: command.reason, actorId: data.actorId, createdAt: now })
        return route.abort('failed')
      }
      expect(command).toMatchObject({ operation: 'review_manual_inspection', targetId: inspectionId, expectedRevision: 0, decision: 'approve' })
      expect(command).not.toHaveProperty('ownerOverride')
      dashboard.inspections = []
      return reply({ clientId: command.clientId, auditId: inspectionId, committed: true })
    }
    if (url.pathname.startsWith('/api/v1/admin/commands/') && request.method() === 'GET') {
      expect(commands).toHaveLength(1); expect(url.pathname.split('/').at(-1)).toBe(commands[0].clientId)
      return reply({ clientId: commands[0].clientId, auditId, committed: true })
    }
    errors.push(`Unexpected admin request ${request.method()} ${url.pathname}`); return route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`${data.origin}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await expect(page.getByRole('heading', { name: 'Review and manage Rentral', exact: true })).toBeVisible({ timeout: 90000 })
  await page.getByRole('button', { name: /Synthetic owner gallery home/ }).click()
  const selected = page.getByRole('region', { name: 'Selected record', exact: true })
  await selected.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('waive_fee')
  await selected.getByLabel('Reason for this decision', { exact: true }).fill('Owner waiver for this synthetic property after reviewing the publication terms.')
  await expect(selected.getByRole('button', { name: 'Record decision', exact: true })).toBeDisabled()
  await selected.getByRole('checkbox', { name: /I am using an owner override/ }).check()
  await selected.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original decision', exact: true })).toBeVisible()
  expect(commands).toHaveLength(1)
  const marker = await page.evaluate(key => sessionStorage.getItem(key), markerKey)
  expect(marker).toContain('waive_fee'); expect(marker).not.toMatch(/access_token|refresh_token|password|latitude|longitude/)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Confirm the original decision', exact: true })).toBeVisible({ timeout: 90000 })
  expect(commands).toHaveLength(1); expect(await page.evaluate(key => sessionStorage.getItem(key), markerKey)).toBe(marker)
  await layouts(page, info, 'admin-owner-recovery')
  await page.getByRole('button', { name: 'Check original decision', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original decision', exact: true })).toHaveCount(0)
  expect(commands).toHaveLength(1); expect(await page.evaluate(key => sessionStorage.getItem(key), markerKey)).toBeNull()
  await page.getByRole('button', { name: new RegExp(`Inspection ${inspectionId}`) }).click()
  await selected.getByLabel('Reason for this decision', { exact: true }).fill('Independent review of the supplied visit evidence confirms the participants met at the property.')
  await selected.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(commands).toHaveLength(2)
  expect(await page.evaluate(key => sessionStorage.getItem(key), markerKey)).toBeNull()
  expect(errors).toEqual([]); expect(outbound).toEqual([])
})

test('photo-only gallery draft upload preserves its original save after a lost acknowledgement without GPS or replay', async ({ page, context }, info) => {
  const data = await enter(context), errors: string[] = [], outbound: string[] = [], uploads: string[] = []
  const markerKey = `rentral.web-listing.request.${data.actorId}`, now = new Date().toISOString()
  let command: { mode: string; listing: Record<string, unknown> } | null = null, saves = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== data.origin) { outbound.push(url.origin); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: body }) })
    if (url.pathname === '/api/v1/auth/web-session') return reply({ user: { id: data.actorId, email: data.email, is_anonymous: false, app_metadata: {}, user_metadata: {} } })
    expect(request.headers()['x-rentral-account']).toBe(data.actorId)
    if (url.pathname === '/api/v1/uploads/listings-media' && request.method() === 'POST') {
      expect(url.searchParams.get('mediaSource')).toBe('approved_gallery'); expect(url.searchParams.get('permissionRevision')).toBe('1')
      expect(request.headers()['content-type']).toBe('image/png')
      expect(request.postDataBuffer()?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true)
      const path = request.headers()['x-upload-path']
      expect(path).toMatch(new RegExp(`^${data.actorId}/[a-f0-9-]+/[a-f0-9-]+\\.png$`)); uploads.push(path)
      return reply({ path })
    }
    if (url.pathname === '/api/v1/my-listings' && request.method() === 'POST') {
      command = request.postDataJSON(); saves += 1
      expect(command).toMatchObject({ mode: 'draft', listing: { draftId: data.galleryDraftId, expectedRevision: 0, mediaSource: 'approved_gallery', galleryPhotos: uploads, address: '14 Fixture Street, Bariga, Lagos', basePrice: '250000', metadata: { listingTitle: 'Photo-only browser gallery', bedrooms: '1' } } })
      for (const field of ['lat', 'lng', 'accuracy', 'captureId', 'videoPath']) expect(command!.listing).not.toHaveProperty(field)
      return route.abort('failed')
    }
    if (url.pathname.startsWith('/api/v1/my-listings/requests/')) {
      expect(request.method()).toBe('GET'); expect(command).not.toBeNull(); expect(url.pathname.split('/').at(-1)).toBe(command!.listing.clientId); expect(url.searchParams.get('mode')).toBe('draft')
      return reply({ id: data.galleryDraftId, status: 'draft' })
    }
    if (url.pathname === `/api/v1/my-listings/${data.galleryDraftId}` && command) return reply({ id: data.galleryDraftId, revision: 1, category: 'house', status: 'draft', address: command.listing.address, basePrice: command.listing.basePrice, metadata: command.listing.metadata,
      wizardStep: 'details', mediaSource: 'approved_gallery', galleryPhotos: uploads, videoPath: null, posterPath: uploads[0], documentPath: null, documentName: null, captureId: null, hasCoords: false, createdAt: now, updatedAt: now, archivedAt: null, actions: { edit: false, resume: true, archive: true, restore: false } })
    errors.push(`Unexpected gallery request ${request.method()} ${url.pathname}`); return route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`${data.origin}/marketplace/listing/create?draft=${data.galleryDraftId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await expect(page.getByRole('heading', { name: 'Gallery listing draft', exact: true })).toBeVisible({ timeout: 90000 })
  await expect(page.getByText('This listing will be labelled as gallery media with an unverified recording location. Inspections use manual review.', { exact: true })).toBeVisible()
  await page.getByLabel('Add photos', { exact: true }).setInputFiles({ name: 'synthetic-gallery.png', mimeType: 'image/png', buffer: readFileSync('apps/mobile/assets/icon.png') })
  await expect(page.getByAltText('Selected gallery photo 1', { exact: true })).toBeVisible()
  await page.getByLabel('Listing title', { exact: true }).fill('Photo-only browser gallery')
  await page.getByLabel('Address', { exact: true }).fill('14 Fixture Street, Bariga, Lagos')
  await page.getByLabel('Base price (NGN)', { exact: true }).fill('250000')
  await page.getByLabel('Bedrooms', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Save gallery draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original listing request', exact: true })).toBeVisible()
  expect(uploads).toHaveLength(1); expect(saves).toBe(1)
  const marker = await page.evaluate(key => sessionStorage.getItem(key), markerKey)
  expect(marker).toContain('approved_gallery'); expect(marker).not.toMatch(/access_token|refresh_token|latitude|longitude|hardware_coordinates/)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Confirm the original listing request', exact: true })).toBeVisible({ timeout: 90000 })
  await expect(page.getByRole('button', { name: 'Save gallery draft', exact: true })).toBeDisabled()
  expect(uploads).toHaveLength(1); expect(saves).toBe(1); expect(await page.evaluate(key => sessionStorage.getItem(key), markerKey)).toBe(marker)
  await layouts(page, info, 'gallery-photo-recovery')
  await page.getByRole('button', { name: 'Check original request', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original listing request', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('14 Fixture Street, Bariga, Lagos')
  await expect(page.getByLabel('Listing title', { exact: true })).toHaveValue('Photo-only browser gallery')
  await expect(page.getByText('Saved photo 1', { exact: true })).toBeVisible()
  expect(uploads).toHaveLength(1); expect(saves).toBe(1); expect(await page.evaluate(key => sessionStorage.getItem(key), markerKey)).toBeNull()
  expect(errors).toEqual([]); expect(outbound).toEqual([])
})

test('raw gallery upload survives reload with original-path readback and each unknown retry requires a fresh check', async ({ page, context }, info) => {
  const data = await enter(context), errors: string[] = [], outbound: string[] = [], uploads: string[] = [], reads: string[] = []
  const markerKey = `rentral.web-gallery.upload.${data.actorId}`, image = readFileSync('apps/mobile/assets/icon.png')
  let saves = 0, firstPath = '', secondPath = '', secondAvailable = false
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== data.origin) { outbound.push(url.origin); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = (body: unknown, status = 200, code = 'FIXTURE_UNAVAILABLE') => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { success: true, data: body } : { success: false, error: body, code }) })
    if (url.pathname === '/api/v1/auth/web-session') return reply({ user: { id: data.actorId, email: data.email, is_anonymous: false, app_metadata: {}, user_metadata: {} } })
    expect(request.headers()['x-rentral-account']).toBe(data.actorId)
    if (url.pathname === '/api/v1/uploads/listings-media' && request.method() === 'POST') {
      expect(url.searchParams.get('mediaSource')).toBe('approved_gallery'); expect(url.searchParams.get('permissionRevision')).toBe('1')
      const path = request.headers()['x-upload-path']; uploads.push(path)
      expect(request.postDataBuffer()?.equals(image)).toBe(true)
      const persisted = await page.evaluate(key => sessionStorage.getItem(key), markerKey)
      expect(persisted).not.toBeNull()
      expect(JSON.parse(persisted!).pendingUpload).toMatchObject({ path, size: image.length, contentType: 'image/png', fingerprintVersion: 'chunked-sha256-v1' })
      if (!firstPath) { firstPath = path; return route.abort('failed') }
      if (!secondPath) { secondPath = path; return route.abort('failed') }
      expect(path).toBe(secondPath)
      if (uploads.length === 3) return route.abort('failed')
      secondAvailable = true; return reply({ path })
    }
    if (url.pathname === '/api/v1/uploads/listings-media/info' && request.method() === 'GET') {
      const path = url.searchParams.get('path') ?? ''; reads.push(path)
      expect([firstPath, secondPath]).toContain(path)
      if (path === firstPath || secondAvailable) return reply({ path, size: image.length, contentType: 'image/png' })
      return reply('The original upload is not confirmed as available.', 409, 'UPLOAD_UNCONFIRMED')
    }
    if (url.pathname === '/api/v1/my-listings' && request.method() === 'POST') { saves += 1; errors.push('Listing POST must remain an explicit later action after raw upload recovery'); return route.abort('blockedbyclient') }
    errors.push(`Unexpected raw-upload recovery request ${request.method()} ${url.pathname}`); return route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(`${data.origin}/marketplace/listing/create?draft=${data.galleryDraftId}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await expect(page.getByRole('heading', { name: 'Gallery listing draft', exact: true })).toBeVisible({ timeout: 90000 })
  await page.getByLabel('Add photos', { exact: true }).setInputFiles({ name: 'first-original.png', mimeType: 'image/png', buffer: image })
  await page.getByLabel('Listing title', { exact: true }).fill('Raw upload recovery gallery')
  await page.getByLabel('Address', { exact: true }).fill('14 Fixture Street, Bariga, Lagos')
  await page.getByLabel('Base price (NGN)', { exact: true }).fill('250000')
  await page.getByRole('button', { name: 'Save gallery draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original file upload', exact: true })).toBeVisible()
  expect(uploads).toHaveLength(1); expect(saves).toBe(0)
  const beforeReload = await page.evaluate(key => sessionStorage.getItem(key), markerKey)
  expect(beforeReload).toContain(firstPath); expect(beforeReload).not.toMatch(/access_token|refresh_token|latitude|longitude|hardware_coordinates|data:image|blob:/)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Confirm the original file upload', exact: true })).toBeVisible({ timeout: 90000 })
  await expect(page.getByLabel('Listing title', { exact: true })).toHaveValue('Raw upload recovery gallery')
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('14 Fixture Street, Bariga, Lagos')
  await expect(page.getByRole('button', { name: 'Save gallery draft', exact: true })).toBeDisabled()
  expect(uploads).toHaveLength(1); expect(reads).toHaveLength(0); expect(saves).toBe(0)
  await page.getByRole('button', { name: 'Check original upload', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original file upload', exact: true })).toHaveCount(0)
  await expect(page.getByText('Saved photo 1', { exact: true })).toBeVisible()
  expect(uploads).toHaveLength(1); expect(reads).toEqual([firstPath]); expect(saves).toBe(0)
  const adopted = JSON.parse((await page.evaluate(key => sessionStorage.getItem(key), markerKey))!)
  expect(adopted.photos).toEqual([{ name: 'first-original.png', path: firstPath }]); expect(adopted.pendingUpload).toBeNull()
  await layouts(page, info, 'raw-upload-adopted-after-reload')

  await page.getByLabel('Add photos', { exact: true }).setInputFiles({ name: 'second-original.png', mimeType: 'image/png', buffer: image })
  await page.getByRole('button', { name: 'Save gallery draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original file upload', exact: true })).toBeVisible()
  expect(uploads).toHaveLength(2); expect(secondPath).not.toBe(firstPath)
  await page.getByRole('button', { name: 'Check original upload', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry exact original upload', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Retry exact original upload', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry exact original upload', exact: true })).toHaveCount(0)
  expect(uploads).toEqual([firstPath, secondPath, secondPath]); expect(saves).toBe(0)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Confirm the original file upload', exact: true })).toBeVisible({ timeout: 90000 })
  await page.getByRole('button', { name: 'Check original upload', exact: true }).click()
  const retry = page.getByRole('button', { name: 'Retry exact original upload', exact: true })
  await expect(retry).toBeDisabled()
  const wrong = Buffer.from(image); wrong[wrong.length - 1] ^= 1
  await page.getByLabel('Reselect original upload', { exact: true }).setInputFiles({ name: 'wrong.png', mimeType: 'image/png', buffer: wrong })
  await expect(page.getByText('This is not the original file. Reselect the same file contents and type; the saved path has not changed.', { exact: true })).toBeVisible()
  await expect(retry).toBeDisabled(); expect(uploads).toHaveLength(3)
  await page.getByLabel('Reselect original upload', { exact: true }).setInputFiles({ name: 'second-original.png', mimeType: 'image/png', buffer: image })
  await expect(retry).toBeEnabled(); await retry.click()
  await expect(page.getByRole('heading', { name: 'Confirm the original file upload', exact: true })).toHaveCount(0)
  expect(uploads).toEqual([firstPath, secondPath, secondPath, secondPath]); expect(saves).toBe(0)
  expect(JSON.parse((await page.evaluate(key => sessionStorage.getItem(key), markerKey))!).photos.map((photo: { path: string }) => photo.path)).toEqual([firstPath, secondPath])
  expect(errors).toEqual([]); expect(outbound).toEqual([])
})

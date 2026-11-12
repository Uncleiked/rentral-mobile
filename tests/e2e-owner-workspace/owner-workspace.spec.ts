import { expect, test, type Page } from '@playwright/test'

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
type ListingCommand = { mode: string; listing: { clientId: string; category: string; draftId?: string; expectedRevision?: number; wizardStep?: string; address?: string; basePrice?: string; metadata?: Record<string, unknown>; mediaSource?: string } }
async function fixture(page: Page, options: { publish?: 'ready' | 'fee' | 'video' | 'lost' } = {}) {
  const errors: string[] = [], outbound: string[] = [], saves: ListingCommand[] = [], publish: unknown[] = [], readbacks: string[] = []
  let saved: ListingCommand | null = null, revision = 0
  const state = { id, revision: 4, status: 'active', trustedPublisher: true, canPublish: false, message: 'Your listing is live.' }
  page.on('pageerror', error => errors.push(error.message))
  page.on('dialog', dialog => { void dialog.accept() })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.hostname !== '127.0.0.1') { outbound.push(url.origin); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const reply = (data: unknown, status = 200, code = 'FIXTURE_ONLY') => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data, code }) })
    if (url.pathname === '/api/v1/auth/web-session') return reply({ user: { id: actor, email: 'synthetic@example.invalid', is_anonymous: false, app_metadata: {}, user_metadata: {} } })
    expect(request.headers()['x-rentral-account']).toBe(actor)
    if (url.pathname === '/api/v1/my-listings' && request.method() === 'POST') {
      const command = request.postDataJSON() as ListingCommand
      saved = command; saves.push(command); revision += 1
      return reply({ id, status: command.mode === 'draft' ? 'draft' : 'pending_verification' }, 201)
    }
    if (url.pathname === '/api/v1/my-listings/' + id && request.method() === 'GET' && saved) {
      const now = new Date().toISOString()
      return reply({ id, revision, category: saved.listing.category, status: 'draft', address: saved.listing.address ?? '', basePrice: saved.listing.basePrice ?? '', metadata: saved.listing.metadata ?? {}, wizardStep: 'details', videoPath: null, posterPath: null, documentPath: null, documentName: null, hasCoords: false, captureId: null, createdAt: now, updatedAt: now, archivedAt: null, mediaSource: 'approved_gallery', galleryPhotos: [], actions: { edit: false, resume: true, archive: true, restore: false } })
    }
    if (url.pathname === '/api/v1/my-listings/' + id + '/publish') {
      if (request.method() === 'GET') { readbacks.push(url.search); return reply(state) }
      publish.push(request.postDataJSON())
      if (options.publish === 'lost') return route.abort('failed')
      if (options.publish === 'fee' || options.publish === 'video') return reply(options.publish === 'fee' ? 'Pay the publication fee before finishing.' : 'The current video must finish processing.', 409, options.publish === 'fee' ? 'PUBLICATION_FEE_REQUIRED' : 'PUBLICATION_VIDEO_REQUIRED')
      return reply(state)
    }
    errors.push('Unexpected synthetic request ' + request.method() + ' ' + url.pathname)
    return route.abort('blockedbyclient')
  })
  return { errors, outbound, saves, publish, readbacks }
}
async function layout(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}
async function navigation(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __ownerNavigations: string[] }).__ownerNavigations)
}
test('owner inventory filters, search, draft resume and archive actions remain usable', async ({ page }) => {
  const check = await fixture(page)
  await page.goto('/?view=inventory')
  await expect(page.getByText('6 of 6 listings', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Drafts 2', exact: true }).click()
  await expect(page.getByText('2 of 6 listings', { exact: false })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search your listings' }).fill('yaba house')
  await expect(page.getByText('1 of 6 listings', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue editing', exact: true })).toHaveAttribute('href', '/marketplace/listing/create?draft=00000000-0000-4000-8000-000000000001&gallery=1')
  await page.getByRole('searchbox').fill('')
  await page.getByRole('button', { name: 'Submitted 1', exact: true }).click()
  await expect(page.getByText('Submitted Surulere duplex', { exact: true })).toBeVisible()
  await expect(page.getByText('Sunny Yaba studio', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Archived 1', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View status and next steps', exact: true })).toHaveAttribute('href', '/marketplace/listing/00000000-0000-4000-8000-000000000005')
  await page.getByRole('searchbox').fill('no-match')
  await expect(page.getByRole('heading', { name: 'No matching listings' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByText('6 of 6 listings', { exact: false })).toBeVisible()
  await layout(page); expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})
test('normal users can save incomplete recorded drafts before media, details or documents are complete', async ({ page }) => {
  const check = await fixture(page)
  for (const step of ['capture', 'details', 'documents', 'checkout']) {
    await page.goto('/?view=wizard')
    const save = page.getByRole('button', { name: 'Save Draft & Exit', exact: true })
    await expect(save).toBeDisabled()
    await expect(page.getByText('Choose an asset type to enable saving.', { exact: false })).toBeVisible()
    await page.evaluate(step => {
      const store = (window as unknown as { __rentralStore: { getState(): { setCategory(value: string): void; setStep(value: string): void; setAddress(value: string): void } } }).__rentralStore.getState()
      store.setCategory('house'); store.setAddress('Incomplete ' + step); store.setStep(step)
    }, step)
    await expect(save).toBeEnabled()
    await layout(page)
    await save.click()
    await expect.poll(() => check.saves.length).toBe(['capture', 'details', 'documents', 'checkout'].indexOf(step) + 1)
    expect(check.saves.at(-1)).toMatchObject({ mode: 'draft', listing: { category: 'house', wizardStep: step, address: 'Incomplete ' + step } })
    expect(check.saves.at(-1)?.listing).not.toHaveProperty('videoPath')
    expect(check.saves.at(-1)?.listing).not.toHaveProperty('documentPath')
    await expect.poll(() => navigation(page)).toContain('/marketplace/listing')
  }
  expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})
test('gallery save actions are visible above the form and incomplete drafts preserve identity and dirty state', async ({ page }) => {
  const check = await fixture(page)
  await page.goto('/?view=gallery')
  const panel = page.getByRole('region', { name: 'Draft saving', exact: true })
  await expect(panel.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled()
  await expect(panel.getByRole('button', { name: 'Save and exit', exact: true })).toBeVisible()
  await page.getByLabel('Listing title', { exact: true }).fill('Saved incomplete gallery')
  await expect(page.getByRole('heading', { name: 'Changes not saved to your account', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Draft saved to your account', exact: true })).toBeVisible()
  expect(check.saves).toHaveLength(1); expect(check.saves[0]).toMatchObject({ mode: 'draft', listing: { mediaSource: 'approved_gallery', metadata: { listingTitle: 'Saved incomplete gallery' } } })
  await page.getByLabel('Listing title', { exact: true }).fill('Updated incomplete gallery')
  await expect(page.getByRole('heading', { name: 'Changes not saved to your account', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Save and exit', exact: true }).click()
  await expect.poll(() => navigation(page)).toContain('/marketplace/listing?status=draft&saved=' + id)
  expect(check.saves).toHaveLength(2); expect(check.saves[1]).toMatchObject({ listing: { draftId: id, expectedRevision: 1, metadata: { listingTitle: 'Updated incomplete gallery' } } })
  await layout(page); expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})
for (const blocker of ['fee', 'video'] as const) test('direct publication explains ' + blocker + ' wait and never claims success', async ({ page }) => {
  const check = await fixture(page, { publish: blocker })
  await page.goto('/?view=publish')
  await page.getByRole('button', { name: 'Finish publishing', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(blocker === 'fee' ? 'Pay the publication fee' : 'video must finish')
  await expect(page.getByRole('button', { name: 'Finish publishing', exact: true })).toBeEnabled()
  expect(check.publish).toHaveLength(1)
  await layout(page); expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})
test('ready direct publication sends one exact command and displays live confirmation', async ({ page }) => {
  const check = await fixture(page)
  await page.goto('/?view=publish')
  await expect(page.getByText('It does not represent an independent review', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Finish publishing', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Your listing is live.')
  expect(check.publish).toHaveLength(1); expect(check.publish[0]).toMatchObject({ expectedRevision: 3 })
  expect(await page.evaluate(() => sessionStorage.getItem('rentral.publish.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))).toBeNull()
  await layout(page); expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})
test('lost publication response survives reload and resolves through readback without another POST', async ({ page }) => {
  const check = await fixture(page, { publish: 'lost' })
  await page.goto('/?view=publish')
  await page.getByRole('button', { name: 'Finish publishing', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Check original publication request', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Check original publication request', exact: true })).toBeVisible()
  expect(check.publish).toHaveLength(1)
  await page.getByRole('button', { name: 'Check original publication request', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Your listing is live.')
  expect(check.publish).toHaveLength(1); expect(check.readbacks).toHaveLength(1)
  await layout(page); expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})
test('revoked direct publishing offers no publication mutation', async ({ page }) => {
  const check = await fixture(page)
  await page.goto('/?view=publish&state=revoked')
  await expect(page.getByText('Direct publishing is unavailable for this listing.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finish publishing', exact: true })).toHaveCount(0)
  expect(check.publish).toHaveLength(0)
  await layout(page); expect(check.errors).toEqual([]); expect(check.outbound).toEqual([])
})

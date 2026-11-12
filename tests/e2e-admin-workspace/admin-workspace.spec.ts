import { expect, test, type Page } from '@playwright/test'
import type { AdminCommand, AdminDashboard, AdminListing } from '../../lib/contracts/admin'
import { permissionsForRole } from '../../lib/auth/roles-policy'
import type { OrganizationReview } from '../../lib/contracts/organizations'

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const memberId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const listingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const inspectionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const auditId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const reason = 'Reviewed the account and its supporting evidence for the gallery upload exception.'

async function fixture(page: Page, options: { unknown?: boolean; missingReceipt?: boolean; conflict?: boolean; protectedOwner?: boolean; organizations?: boolean; extendedInventory?: boolean; truncatedExport?: boolean; searchFailure?: boolean; mediaFailure?: boolean; directIntent?: boolean; finance?: boolean } = {}) {
  const organizationCommands: OrganizationReview[] = []
  const commands: AdminCommand[] = [], outbound: string[] = [], errors: string[] = [], listingQueries: URLSearchParams[] = [], exportQueries: URLSearchParams[] = [], mediaRequests: string[] = []
  const now = new Date().toISOString()
  const user = (id: string, email: string, role: AdminDashboard['role']) => ({ id, revision: 0, email, username: 'synthetic', role, suspended: false, closed: false, galleryAllowed: false, freePostingAllowed: false, directPublishAllowed: false, galleryPermissionRevision: 0, createdAt: now })
  const dashboard: AdminDashboard = {
    role: options.finance ? 'finance' : options.protectedOwner ? 'admin' : 'owner', permissions: options.finance ? [...permissionsForRole('finance')] : ['staff:workspace', 'listing:review', 'listing:waive', 'user:manage', 'staff:manage', 'gallery:manage', 'owner:transfer', 'inspection:review', 'operations:read', 'finance:review', 'safety:review', 'ad:review', 'insights:view'],
    listings: [{ id: listingId, revision: 0, category: 'house', title: 'Synthetic gallery apartment', address: 'Fixture Street, Lagos', status: 'pending_verification', publicationMode: 'manual_review', source: 'approved_gallery', archived: false, createdAt: now, lister: { id: memberId, username: 'synthetic', freePostingAllowed: false, directPublishAllowed: false }, document: { present: true, status: 'pending', approvalMatches: false }, media: { hasVideo: false, photoCount: 2, status: null }, locationStatus: 'exempt_gallery', fee: { waived: false, paid: false } }],
    users: [user(actorId, 'owner@example.invalid', options.finance ? 'finance' : options.protectedOwner ? 'admin' : 'owner'), user(memberId, 'member@example.invalid', options.protectedOwner ? 'owner' : 'member')],
    inspections: [{ id: inspectionId, revision: 0, listingId, status: 'pending', evidence: 'Synthetic independent inspection evidence for presentation checks.', requestedBy: memberId, requestedAt: now, renterId: memberId, hostId: listingId, startsAt: now }],
    audit: [],
  }
  const allListings: AdminListing[] = [...dashboard.listings]
  if (options.extendedInventory) {
    for (let index = 1; index <= 26; index++) allListings.push({ ...dashboard.listings[0], id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'), title: 'Late inventory apartment ' + index })
    allListings.push({ ...dashboard.listings[0], id: '10000000-0000-4000-8000-000000000001', title: 'Live Toyota rental', category: 'car', status: 'active', fee: { waived: false, paid: true } })
    allListings.push({ ...dashboard.listings[0], id: '20000000-0000-4000-8000-000000000001', title: 'Harbour boat charter', category: 'boat', source: 'recorded', media: { hasVideo: true, photoCount: 0, status: 'ready' }, locationStatus: 'matched', fee: { waived: true, paid: false } })
  }
  if (options.directIntent) allListings.push({ ...dashboard.listings[0], id: '30000000-0000-4000-8000-000000000001', title: 'Trusted publisher submission', publicationMode: 'trusted_publisher' })
  const filteredListings = (params: URLSearchParams): AdminListing[] => allListings.filter(item => {
    const query = (params.get('query') ?? '').toLowerCase().replace(/^@/, '')
    const host = dashboard.users.find(user => user.id === item.lister.id)
    const status = params.get('status') ?? 'review', category = params.get('category') ?? 'all', source = params.get('source') ?? 'all'
    const fee = params.get('fee') ?? 'all', archived = params.get('archived') ?? 'exclude'
    return item.status !== 'draft' && (status !== 'review' || item.publicationMode !== 'trusted_publisher') && (status === 'all' || item.status === (status === 'review' ? 'pending_verification' : status)) &&
      (category === 'all' || category === item.category) && (source === 'all' || source === item.source) &&
      (!params.get('listerId') || params.get('listerId') === item.lister.id) &&
      (archived === 'include' || item.archived === (archived === 'only')) &&
      (fee === 'all' || fee === 'waived' && item.fee.waived || fee === 'paid' && item.fee.paid || fee === 'unpaid' && !item.fee.waived && !item.fee.paid) &&
      (!query || [item.title, item.address, item.id, item.lister.username, host?.email].some(value => value?.toLowerCase().includes(query)))
  })
  const application = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', userId: memberId, revision: 0,
    legalName: 'Synthetic Harbour Living Limited', registrationType: 'company', registrationNumber: 'RC FIXTURE',
    representativeName: 'Synthetic Representative', representativeRole: 'Director', documentKind: 'cac_certificate',
    supportingKind: null, status: 'pending', reviewReason: null, submittedAt: now, reviewedAt: null }
  const receipts = new Set<string>()
  let conflicted = false
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.hostname !== '127.0.0.1') { outbound.push(url.origin); return route.abort('blockedbyclient') }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (!url.pathname.startsWith('/api/v1/files/')) expect(request.headers()['x-rentral-account']).toBe(actorId)
    const success = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    if (url.pathname === '/api/v1/admin') return success(dashboard)
    if (url.pathname === `/api/v1/admin/organizations/${application.id}/document`) return success({ url: 'http://127.0.0.1:4184/api/v1/files/compliance-docs/synthetic-registration.pdf?token=fixture', expiresAt: new Date(Date.now() + 60000).toISOString() })
    if (url.pathname === '/api/v1/admin/organizations' && options.organizations) {
      if (request.method() === 'POST') {
        const command = request.postDataJSON() as OrganizationReview
        organizationCommands.push(command); application.revision += 1; application.status = command.decision === 'approve' ? 'approved' : command.decision === 'reject' ? 'rejected' : 'changes_requested'
        return success({ clientId: command.clientId, resourceId: application.id, committed: true })
      }
      return success({ items: [application] })
    }
    if (url.pathname === '/api/v1/admin/organizations') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'ORGANIZATION_SETUP_REQUIRED', error: 'Organization review is not prepared in this synthetic fixture.' }) })
    if (url.pathname === '/api/v1/admin/users') {
      const query = (url.searchParams.get('query') ?? '').toLowerCase()
      return success({ items: dashboard.users.filter(item => [item.email, item.username, item.id].some(value => value?.toLowerCase().startsWith(query))) })
    }
    if (url.pathname === '/api/v1/admin/listings') {
      listingQueries.push(new URLSearchParams(url.searchParams))
      if (options.searchFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Synthetic listing queue unavailable.', code: 'DATABASE_UNAVAILABLE' }) })
      const matched = filteredListings(url.searchParams), offset = Number(url.searchParams.get('cursor') ?? '0'), limit = Number(url.searchParams.get('limit') ?? '25')
      const items = matched.slice(offset, offset + limit), hasMore = offset + limit < matched.length
      return success({ items, total: matched.length, hasMore, nextCursor: hasMore ? String(offset + limit) : null })
    }
    if (url.pathname === '/api/v1/admin/listings/export') {
      exportQueries.push(new URLSearchParams(url.searchParams))
      const matched = filteredListings(url.searchParams)
      return route.fulfill({ contentType: 'text/csv; charset=utf-8', headers: {
        'X-Rentral-Export-Rows': String(matched.length), 'X-Rentral-Export-Matched': options.truncatedExport ? '1200' : String(matched.length),
        'X-Rentral-Export-Truncated': String(Boolean(options.truncatedExport)) }, body: 'Listing ID,Title\r\n' + matched.map(item => item.id + ',' + item.title).join('\r\n') })
    }
    if (/^\/api\/v1\/admin\/listings\/[^/]+\/media$/.test(url.pathname)) {
      mediaRequests.push(url.pathname)
      if (options.mediaFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Private media is temporarily unavailable.', code: 'MEDIA_UNAVAILABLE' }) })
      return success({ source: 'approved_gallery', items: [{ kind: 'image', url: '/api/v1/files/listings-media/synthetic.png?token=fixture', expiresAt: new Date(Date.now() + 60000).toISOString() }] })
    }
    if (url.pathname === `/api/v1/admin/listings/${listingId}`) return success(dashboard.listings[0])
    if (url.pathname === `/api/v1/admin/listings/${listingId}/document`) return success({ url: 'http://127.0.0.1:4184/api/v1/files/compliance-docs/synthetic.pdf?token=fixture', expiresAt: new Date(Date.now() + 60000).toISOString(), digest: 'a'.repeat(64) })
    if (url.pathname.startsWith('/api/v1/files/listings-media/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6X8AAAAASUVORK5CYII=', 'base64') })
    if (url.pathname.startsWith('/api/v1/files/')) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7 synthetic document' })
    if (url.pathname === '/api/v1/admin/commands' && request.method() === 'POST') {
      const command = request.postDataJSON() as AdminCommand
      commands.push(command)
      if (options.conflict && !conflicted) {
        conflicted = true
        dashboard.users.find(item => item.id === command.targetId)!.revision += 1
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'ADMIN_TARGET_CHANGED', error: 'This record changed. Refresh its current state before creating another review.' }) })
      }
      if (options.unknown && commands.length === 1 && options.missingReceipt) return route.abort('failed')
      if (command.operation === 'set_gallery_permission') {
        const target = dashboard.users.find(item => item.id === command.targetId)!
        target.galleryAllowed = command.allowed; target.galleryPermissionRevision += 1; target.revision += 1
      }
      if (command.operation === 'set_free_posting_permission' || command.operation === 'set_direct_publish_permission') {
        const target = dashboard.users.find(item => item.id === command.targetId)!
        if (command.operation === 'set_free_posting_permission') target.freePostingAllowed = command.allowed
        else target.directPublishAllowed = command.allowed
        target.revision += 1
      }
      if (command.operation === 'waive_fee') {
        const target = allListings.find(item => item.id === command.targetId)!
        target.fee.waived = true; target.revision += 1
      }
      receipts.add(command.clientId)
      if (options.unknown && commands.length === 1) return route.abort('failed')
      return success({ clientId: command.clientId, auditId, committed: true })
    }
    if (url.pathname.startsWith('/api/v1/admin/commands/') && request.method() === 'GET') {
      const id = url.pathname.split('/').at(-1)!
      return receipts.has(id) ? success({ clientId: id, auditId, committed: true }) : route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'NOT_FOUND', error: 'No receipt recorded.' }) })
    }
    errors.push(`Unexpected request ${request.method()} ${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  await page.goto('/')
  const fontState = await page.evaluate(async () => {
    await Promise.all(['400', '500', '600', '700'].map(weight => document.fonts.load(`${weight} 14px Inter`)))
    await document.fonts.ready
    return { family: getComputedStyle(document.body).fontFamily, loaded: [...document.fonts].filter(font => font.family === 'Inter').map(font => font.status) }
  })
  expect(fontState.family).toMatch(/^Inter/)
  expect(fontState.loaded).toEqual(['loaded', 'loaded', 'loaded', 'loaded'])
  await expect(page.getByRole('heading', { name: 'Review and manage Rentral', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: options.finance ? 'Audit trail' : 'Listings', exact: true })).toBeVisible()
  if (!options.finance) await expect(page.getByRole('heading', { name: 'Listing review queue', exact: true })).toBeVisible()
  return { commands, organizationCommands, outbound, errors, dashboard, listingQueries, exportQueries, mediaRequests }
}
async function member(page: Page, email = 'member@example.invalid') {
  await page.getByRole('tab', { name: 'Members & permissions', exact: true }).click()
  const searchBox = await page.getByRole('searchbox', { name: 'Search email, username or account ID' }).boundingBox()
  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(Math.min(240, page.viewportSize()!.width - 32))
  await page.getByRole('button').filter({ hasText: email }).click()
  return page.getByRole('region', { name: 'Selected record', exact: true })
}

test('focused tabs, server queue filters and compact rows fit the viewport', async ({ page }, info) => {
  const state = await fixture(page)
  await page.getByRole('searchbox', { name: 'Search submitted listings' }).fill('missing')
  await expect(page.getByRole('heading', { name: 'No matching listings' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search submitted listings' }).clear()
  await page.getByRole('switch', { name: 'Compact rows' }).check()
  await page.getByRole('button', { name: /Synthetic gallery apartment/ }).click()
  await expect(page.getByRole('region', { name: 'Selected record' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('admin-listing-review.png'), fullPage: true })
  await page.getByRole('tab', { name: 'Inspections', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Manual inspection evidence', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Audit trail', exact: true }).click()
  await expect(page.getByText('No administrative decisions recorded yet.', { exact: true })).toBeVisible()
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('owner self-gallery approval requires a changed switch, detailed reason and explicit override', async ({ page }, info) => {
  const state = await fixture(page)
  const review = await member(page, 'owner@example.invalid')
  const save = review.getByRole('button', { name: 'Record decision', exact: true })
  await expect(save).toBeDisabled()
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill('Short reason text.')
  await review.getByRole('checkbox', { name: /I am deciding my own posting permission/ }).check()
  await expect(save).toBeDisabled()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill(reason)
  await expect(save).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('admin-gallery-approval.png'), fullPage: true })
  await save.click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands).toHaveLength(1)
  expect(state.commands[0]).toMatchObject({ operation: 'set_gallery_permission', targetId: actorId, expectedRevision: 0, allowed: true, ownerOverride: true, reason })
  await expect(page.getByRole('button').filter({ hasText: 'owner@example.invalid' })).toContainText('Gallery allowed')
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('member grant and revocation save the explicit desired state and refresh searched results', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('tab', { name: 'Members & permissions', exact: true }).click()
  const searchBox = await page.getByRole('searchbox', { name: 'Search email, username or account ID' }).boundingBox()
  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(Math.min(240, page.viewportSize()!.width - 32))
  await page.getByRole('searchbox', { name: 'Search email, username or account ID' }).fill('member@')
  await page.getByRole('button', { name: 'Find members', exact: true }).click()
  await page.getByRole('button').filter({ hasText: 'member@example.invalid' }).click()
  let review = page.getByRole('region', { name: 'Selected record' })
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill(reason)
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button').filter({ hasText: 'member@example.invalid' })).toContainText('Gallery allowed')
  await page.getByRole('button').filter({ hasText: 'member@example.invalid' }).click()
  review = page.getByRole('region', { name: 'Selected record' })
  await expect(review.getByRole('switch', { name: 'Allow gallery uploads' })).toBeChecked()
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).uncheck()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill('Revoked the exception after reviewing the member evidence and current listing quality.')
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands.map(command => command.operation === 'set_gallery_permission' ? command.allowed : null)).toEqual([true, false])
  expect(state.commands[1]).toMatchObject({ targetId: memberId, expectedRevision: 1, ownerOverride: false })
  await expect(page.getByRole('button').filter({ hasText: 'member@example.invalid' })).toContainText('Gallery not allowed')
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('a lost grant acknowledgement survives reload and receipt readback never sends another grant', async ({ page }) => {
  const state = await fixture(page, { unknown: true })
  const review = await member(page)
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill(reason)
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original decision' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Confirm the original decision' })).toBeVisible()
  expect(state.commands).toHaveLength(1)
  await page.getByRole('button', { name: 'Check original decision', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original decision' })).toHaveCount(0)
  expect(state.commands).toHaveLength(1)
  expect(await page.evaluate(id => sessionStorage.getItem(`rentral.admin.command.${id}`), actorId)).toBeNull()
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('an absent receipt permits only explicit resend of the original grant body and identifier', async ({ page }) => {
  const state = await fixture(page, { unknown: true, missingReceipt: true })
  const review = await member(page)
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill(reason)
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resend exact saved decision', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Check original decision', exact: true }).click()
  await page.getByRole('button', { name: 'Resend exact saved decision', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirm the original decision' })).toHaveCount(0)
  expect(state.commands).toHaveLength(2); expect(state.commands[1]).toEqual(state.commands[0])
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('a stale member revision cannot masquerade as success and requires a fresh record', async ({ page }) => {
  const state = await fixture(page, { conflict: true })
  let review = await member(page)
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill(reason)
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('This record changed. Refresh its current state before creating another review.', { exact: true })).toBeVisible()
  expect(state.commands).toHaveLength(1)
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Selected record' })).toHaveCount(0)
  review = await member(page)
  await review.getByRole('switch', { name: 'Allow gallery uploads' }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision' }).fill(reason)
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands[1]).toMatchObject({ expectedRevision: 1, allowed: true })
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('ordinary admin cannot edit the protected owner account', async ({ page }) => {
  const state = await fixture(page, { protectedOwner: true })
  const review = await member(page)
  await expect(review.getByText('The platform owner is protected from ordinary account and role changes.', { exact: true })).toBeVisible()
  await expect(review.getByRole('button', { name: 'Record decision', exact: true })).toHaveCount(0)
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([])
})

test('keyboard tabs and member search empty states remain accessible', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('tab', { name: 'Listings', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Members & permissions', exact: true })).toBeFocused()
  await page.getByRole('searchbox', { name: 'Search email, username or account ID' }).fill('absent@')
  await page.getByRole('button', { name: 'Find members', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No matching accounts' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.getByRole('button').filter({ hasText: 'member@example.invalid' })).toBeVisible()
  await page.getByRole('tab', { name: 'Members & permissions', exact: true }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'More workspaces', exact: true })).toBeFocused()
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})
test('organization readiness failure leaves the other admin workspaces usable', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('tab', { name: 'Organizations', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Organization applications', exact: true })).toBeVisible()
  await expect(page.getByText('Organization review is not prepared in this synthetic fixture.', { exact: true })).toBeVisible()
  await expect(page.getByText('Organization review requires its separately prepared database collection. Existing admin tools remain available.', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Members & permissions', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Members and posting permissions', exact: true })).toBeVisible()
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})
test('organization approval requires independent evidence checks and opening its registration document', async ({ page, context }, info) => {
  const state = await fixture(page, { organizations: true })
  await context.route('**/api/v1/files/**', route => route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7 synthetic registration evidence' }))
  await page.getByRole('tab', { name: 'Organizations', exact: true }).click()
  await page.getByRole('button').filter({ hasText: 'Synthetic Harbour Living Limited' }).click()
  const queue = page.getByRole('region', { name: 'Organization applications', exact: true })
  await queue.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('approve')
  await queue.getByRole('textbox', { name: 'Reason visible to the applicant (at least 15 characters)', exact: true }).fill('The registration and representative authority were independently checked against the submitted evidence.')
  const save = queue.getByRole('button', { name: 'Record organization decision', exact: true })
  await expect(save).toBeDisabled()
  await queue.getByRole('checkbox', { name: 'Legal name and registration number match the submitted evidence.', exact: true }).check()
  await queue.getByRole('checkbox', { name: 'I checked the registration against the official CAC register.', exact: true }).check()
  await queue.getByRole('checkbox', { name: 'I established the representative’s authority to act for this organization.', exact: true }).check()
  await expect(save).toBeDisabled()
  await queue.getByRole('button', { name: 'Prepare registration document', exact: true }).click()
  await expect(save).toBeDisabled()
  const [popup] = await Promise.all([page.waitForEvent('popup'), queue.getByRole('link', { name: 'Download private document', exact: true }).click()])
  await popup.close()
  await expect(save).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('admin-organization-review.png'), fullPage: true })
  await save.click()
  await expect(page.getByText('Organization decision recorded. Current applications are shown.', { exact: true })).toBeVisible()
  expect(state.organizationCommands).toHaveLength(1)
  expect(state.organizationCommands[0]).toMatchObject({ decision: 'approve', expectedRevision: 0, checklist: { registrationMatches: true, registerChecked: true, authorityConfirmed: true } })
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('server listing search reaches inventory outside the dashboard and cursor pages remain usable', async ({ page }) => {
  const state = await fixture(page, { extendedInventory: true })
  await expect(page.getByText('Showing 1-25 of 28 matching listings.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Showing 26-28 of 28 matching listings.', { exact: true })).toBeVisible()
  expect(state.listingQueries.at(-1)?.get('cursor')).toBe('25')
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText('Showing 1-25 of 28 matching listings.', { exact: true })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search submitted listings', exact: true }).fill('Late inventory apartment 26')
  await expect(page.getByText('Showing 1-1 of 1 matching listings.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Late inventory apartment 26/ })).toBeVisible()
  expect(state.dashboard.listings).toHaveLength(1)
  expect(state.listingQueries.at(-1)?.get('query')).toBe('Late inventory apartment 26')
  expect(state.listingQueries.at(-1)?.has('cursor')).toBe(false)
  await page.getByRole('searchbox', { name: 'Search submitted listings', exact: true }).fill('member@example.invalid')
  await expect(page.getByText('Showing 1-25 of 28 matching listings.', { exact: true })).toBeVisible()
  expect(state.listingQueries.at(-1)?.get('query')).toBe('member@example.invalid')
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('a member opens all their submissions and filters media, fee, category and lifecycle', async ({ page }) => {
  const state = await fixture(page, { extendedInventory: true })
  const review = await member(page)
  await review.getByRole('button', { name: "View this member's listings", exact: true }).click()
  await expect(page.getByText('Showing 1-25 of 29 matching listings.', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Listing status', exact: true })).toHaveValue('all')
  expect(state.listingQueries.at(-1)?.get('listerId')).toBe(memberId)
  await page.getByRole('combobox', { name: 'Asset category', exact: true }).selectOption('car')
  await expect(page.getByRole('button', { name: /Live Toyota rental/ })).toBeVisible()
  await page.getByRole('combobox', { name: 'Asset category', exact: true }).selectOption('boat')
  await page.getByText('More filters and queue settings', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Media source', exact: true }).selectOption('recorded')
  await page.getByRole('combobox', { name: 'Publication fee', exact: true }).selectOption('waived')
  await expect(page.getByRole('button', { name: /Harbour boat charter/ })).toBeVisible()
  await expect(page.getByText('Showing 1-1 of 1 matching listings.', { exact: true })).toBeVisible()
  expect(Object.fromEntries(state.listingQueries.at(-1)!)).toMatchObject({ status: 'all', category: 'boat', source: 'recorded', fee: 'waived', listerId: memberId })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'All hosts', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Listing status', exact: true })).toHaveValue('review')
  await expect(page.getByText('Showing 1-25 of 28 matching listings.', { exact: true })).toBeVisible()
  expect(state.listingQueries.at(-1)?.has('listerId')).toBe(false)
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('CSV export follows the current member and filters across pages with an explicit download result', async ({ page }) => {
  const state = await fixture(page, { extendedInventory: true })
  const review = await member(page)
  await review.getByRole('button', { name: "View this member's listings", exact: true }).click()
  await page.getByRole('combobox', { name: 'Asset category', exact: true }).selectOption('car')
  await expect(page.getByRole('button', { name: /Live Toyota rental/ })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export matching listings', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^rentral-listings-\d{4}-\d{2}-\d{2}\.csv$/)
  await expect(page.getByText('Downloaded all 1 matching listings.', { exact: true })).toBeVisible()
  expect(Object.fromEntries(state.exportQueries[0])).toMatchObject({ category: 'car', status: 'all', listerId: memberId })
  expect(state.exportQueries[0].has('cursor')).toBe(false); expect(state.exportQueries[0].has('limit')).toBe(false)
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('a truncated export is labelled as partial', async ({ page }) => {
  const state = await fixture(page, { truncatedExport: true })
  await expect(page.getByRole('button', { name: 'Export matching listings', exact: true })).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export matching listings', exact: true }).click()
  await downloadPromise
  await expect(page.getByText('Downloaded 1 of 1200 matching listings. Add filters to export a smaller, complete result.', { exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

test('free posting and direct publication are independent audited permissions', async ({ page }, info) => {
  const state = await fixture(page)
  let review = await member(page)
  await review.getByRole('button', { name: 'Free posting', exact: true }).click()
  await review.getByRole('switch', { name: 'Allow free listing posts', exact: true }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision', exact: true }).fill(reason)
  expect(state.dashboard.users[1]).toMatchObject({ galleryAllowed: false, freePostingAllowed: false, directPublishAllowed: false })
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands[0]).toMatchObject({ operation: 'set_free_posting_permission', allowed: true, ownerOverride: false, targetId: memberId, expectedRevision: 0 })
  expect(state.dashboard.users[1]).toMatchObject({ galleryAllowed: false, freePostingAllowed: true, directPublishAllowed: false })
  review = await member(page)
  await review.getByRole('button', { name: 'Direct publication', exact: true }).click()
  await review.getByRole('switch', { name: 'Allow direct publication', exact: true }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision', exact: true }).fill('Approved direct publication after independently checking the account, authority and current supporting evidence.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('admin-independent-posting-permissions.png'), fullPage: true })
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands[1]).toMatchObject({ operation: 'set_direct_publish_permission', allowed: true, ownerOverride: false, targetId: memberId, expectedRevision: 1 })
  expect(state.dashboard.users[1]).toMatchObject({ galleryAllowed: false, freePostingAllowed: true, directPublishAllowed: true, galleryPermissionRevision: 0 })
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('an owner must acknowledge their own direct publication exception before it is committed', async ({ page }) => {
  const state = await fixture(page)
  const review = await member(page, 'owner@example.invalid')
  await review.getByRole('button', { name: 'Direct publication', exact: true }).click()
  await review.getByRole('switch', { name: 'Allow direct publication', exact: true }).check()
  await review.getByRole('textbox', { name: 'Reason for this decision', exact: true }).fill(reason)
  const save = review.getByRole('button', { name: 'Record decision', exact: true })
  await expect(save).toBeDisabled()
  await review.getByRole('checkbox', { name: /I am deciding my own posting permission/ }).check()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands[0]).toMatchObject({ operation: 'set_direct_publish_permission', allowed: true, ownerOverride: true, targetId: actorId })
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('the per-listing fee waiver is separate from payments and admin publication still requires document review', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('button', { name: /Synthetic gallery apartment/ }).click()
  let review = page.getByRole('region', { name: 'Selected record', exact: true })
  await review.getByRole('button', { name: 'Prepare publication', exact: true }).click()
  await review.getByRole('textbox', { name: 'Reason for this decision', exact: true }).fill(reason)
  await expect(review.getByRole('button', { name: 'Record decision', exact: true })).toBeDisabled()
  await expect(review.getByText('Review and approve the exact current authority document.', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Waive this listing fee', exact: true }).click()
  await review.getByRole('textbox', { name: 'Reason for this decision', exact: true }).fill(reason)
  await review.getByRole('button', { name: 'Record decision', exact: true }).click()
  await expect(page.getByText('Decision saved. Current records are shown below.', { exact: true })).toBeVisible()
  expect(state.commands[0]).toMatchObject({ operation: 'waive_fee', targetId: listingId, ownerOverride: false })
  expect(state.dashboard.listings[0].fee).toEqual({ waived: true, paid: false })
  await page.getByRole('button', { name: /Synthetic gallery apartment/ }).click()
  review = page.getByRole('region', { name: 'Selected record', exact: true })
  await expect(review.getByText('Waived by admin', { exact: true })).toBeVisible()
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('private listing media is loaded only on request without exposing document or location claims', async ({ page }) => {
  const state = await fixture(page)
  await page.getByRole('button', { name: /Synthetic gallery apartment/ }).click()
  const review = page.getByRole('region', { name: 'Selected record', exact: true })
  expect(state.mediaRequests).toHaveLength(0)
  await review.getByRole('button', { name: 'Preview listing media', exact: true }).click()
  const photo = review.getByRole('img', { name: 'Listing photo 1: Synthetic gallery apartment', exact: true })
  await expect(photo).toBeVisible()
  await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true)
  await expect(review.getByText('Gallery media does not establish a recorded location.', { exact: false })).toBeVisible()
  expect(state.mediaRequests).toHaveLength(1)
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('an unavailable listing queue shows an actionable error without administrative writes', async ({ page }) => {
  const state = await fixture(page, { searchFailure: true })
  await expect(page.getByRole('heading', { name: 'The queue could not be loaded', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export matching listings', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry listing search', exact: true }).click()
  await expect.poll(() => state.listingQueries.length).toBeGreaterThan(1)
  await expect(page.getByText('Synthetic listing queue unavailable.', { exact: true })).toBeVisible()
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})


test('direct publisher submissions stay outside the manual review default and remain searchable in all submissions', async ({ page }) => {
  const state = await fixture(page, { directIntent: true })
  await expect(page.getByText('Showing 1-1 of 1 matching listings.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Trusted publisher submission/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Listing status', exact: true }).selectOption('all')
  await expect(page.getByRole('button', { name: /Trusted publisher submission/ })).toBeVisible()
  await expect(page.getByText('Showing 1-2 of 2 matching listings.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Trusted publisher submission/ }).click()
  const review = page.getByRole('region', { name: 'Selected record', exact: true })
  await expect(review.getByText('Direct publisher - awaiting completion', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Prepare publication', exact: true }).click()
  await review.getByRole('textbox', { name: 'Reason for this decision', exact: true }).fill(reason)
  await expect(review.getByRole('button', { name: 'Record decision', exact: true })).toBeDisabled()
  await expect(review.getByText('Review and approve the exact current authority document.', { exact: true })).toBeVisible()
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('finance staff retain their current role scope without listing or posting-grant controls', async ({ page }) => {
  const state = await fixture(page, { finance: true })
  await expect(page.getByRole('tab', { name: 'Members & permissions', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Listings', exact: true })).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Allow free listing posts', exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: 'More workspaces', exact: true }).click()
  await expect(page.getByRole('link', { name: /Payments, refunds and settlement/ })).toBeVisible()
  expect(state.commands).toHaveLength(0); expect(state.listingQueries).toHaveLength(0)
  expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

test('private media failures offer a retry while keeping permission and publication decisions unchanged', async ({ page }) => {
  const state = await fixture(page, { mediaFailure: true })
  await page.getByRole('button', { name: /Synthetic gallery apartment/ }).click()
  const review = page.getByRole('region', { name: 'Selected record', exact: true })
  await review.getByRole('button', { name: 'Preview listing media', exact: true }).click()
  await expect(review.getByText('Private media is temporarily unavailable.', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Preview listing media', exact: true }).click()
  await expect.poll(() => state.mediaRequests.length).toBe(2)
  await expect(review.getByRole('button', { name: 'Record decision', exact: true })).toBeDisabled()
  expect(state.commands).toHaveLength(0); expect(state.errors).toEqual([]); expect(state.outbound).toEqual([])
})

import { expect, test, type Page } from '@playwright/test'
import type { AdminCommand } from '../../lib/contracts/admin'
import type { OrganizationReview } from '../../lib/contracts/organizations'

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const memberId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const listingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const inspectionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const auditId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const reason = 'Reviewed the account and its supporting evidence for the gallery upload exception.'

async function fixture(page: Page, options: { unknown?: boolean; missingReceipt?: boolean; conflict?: boolean; protectedOwner?: boolean; organizations?: boolean } = {}) {
  const organizationCommands: OrganizationReview[] = []
  const commands: AdminCommand[] = [], outbound: string[] = [], errors: string[] = []
  const now = new Date().toISOString()
  const user = (id: string, email: string, role: string) => ({ id, revision: 0, email, username: 'synthetic', role, suspended: false, closed: false, galleryAllowed: false, galleryPermissionRevision: 0, createdAt: now })
  const dashboard = {
    role: options.protectedOwner ? 'admin' : 'owner', permissions: ['staff:workspace', 'listing:review', 'listing:waive', 'user:manage', 'staff:manage', 'gallery:manage', 'owner:transfer', 'inspection:review', 'operations:read', 'finance:review', 'safety:review', 'ad:review', 'insights:view'],
    listings: [{ id: listingId, revision: 0, category: 'house', title: 'Synthetic gallery apartment', address: 'Fixture Street, Lagos', status: 'pending_verification', source: 'approved_gallery', archived: false, createdAt: now, lister: { id: memberId, username: 'synthetic' }, document: { present: true, status: 'pending', approvalMatches: false }, media: { hasVideo: false, photoCount: 2, status: null }, locationStatus: 'exempt_gallery', fee: { waived: false, paid: false } }],
    users: [user(actorId, 'owner@example.invalid', options.protectedOwner ? 'admin' : 'owner'), user(memberId, 'member@example.invalid', options.protectedOwner ? 'owner' : 'member')],
    inspections: [{ id: inspectionId, revision: 0, listingId, status: 'pending', evidence: 'Synthetic independent inspection evidence for presentation checks.', requestedBy: memberId, requestedAt: now, renterId: memberId, hostId: listingId, startsAt: now }],
    audit: [],
  }
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
    expect(request.headers()['x-rentral-account']).toBe(actorId)
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
      return success({ items: dashboard.users.filter(item => [item.email, item.username, item.id].some(value => value.toLowerCase().startsWith(query))) })
    }
    if (url.pathname === `/api/v1/admin/listings/${listingId}`) return success(dashboard.listings[0])
    if (url.pathname === `/api/v1/admin/listings/${listingId}/document`) return success({ url: 'http://127.0.0.1:4184/api/v1/files/compliance-docs/synthetic.pdf?token=fixture', expiresAt: new Date(Date.now() + 60000).toISOString(), digest: 'a'.repeat(64) })
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
  await expect(page.getByRole('tab', { name: 'Listings', exact: true })).toBeVisible()
  return { commands, organizationCommands, outbound, errors, dashboard }
}
async function member(page: Page, email = 'member@example.invalid') {
  await page.getByRole('tab', { name: 'Members & permissions', exact: true }).click()
  const searchBox = await page.getByRole('searchbox', { name: 'Search email, username or account ID' }).boundingBox()
  expect(searchBox?.width ?? 0).toBeGreaterThanOrEqual(Math.min(240, page.viewportSize()!.width - 32))
  await page.getByRole('button').filter({ hasText: email }).click()
  return page.getByRole('region', { name: 'Selected record', exact: true })
}

test('focused tabs, loaded-queue filters and compact rows fit the viewport', async ({ page }, info) => {
  const state = await fixture(page)
  await page.getByRole('searchbox', { name: 'Search loaded listings' }).fill('missing')
  await expect(page.getByRole('heading', { name: 'No matching listings' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search loaded listings' }).clear()
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
  await review.getByRole('checkbox', { name: /I am deciding my own gallery-upload exception/ }).check()
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
  await expect(page.getByRole('heading', { name: 'Members and uploader permissions', exact: true })).toBeVisible()
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
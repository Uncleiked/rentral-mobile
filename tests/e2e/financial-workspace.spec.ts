import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { financialOverviewSchema, financialOperationSchema } from '../../lib/contracts/financial'

// Only the owned localhost HTTP harness supplies this synthetic session. This
// suite never reads .env.local or promotes a configured application account.
const fixturePath = process.env.RENTRAL_FINANCIAL_UI_FIXTURE
const fixture: { origin: string; accessToken: string; refreshToken: string } | null = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null
test.skip(!fixture, 'Run through the owned localhost HTTP fixture.')

test('member payment history uses owner scope and hides staff, payout and receipt recovery controls', async ({ page, context }) => {
  test.setTimeout(180000)
  if (!fixture) throw new Error('Owned fixture required')
  const origin = new URL(fixture.origin)
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname)
  await context.addCookies([{ name: 'rentral_access', value: fixture.accessToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' }, { name: 'rentral_refresh', value: fixture.refreshToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' }])
  const overview = financialOverviewSchema.parse({ operations: [], recipients: [], receipts: [], settlementAvailable: false, operationsNextCursor: null, paymentsNextCursor: null,
    payments: [{ id: '11111111-1111-4111-8111-111111111111', bookingId: null, refundBookingId: null, reference: 'owned-commercial-refund-source', environment: 'test', amountKobo: '100025', availableKobo: '100025', status: 'succeeded', createdAt: new Date().toISOString() }] })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin.origin) return route.abort('blockedbyclient')
    if (url.pathname === '/api/v1/financial') {
      expect(url.searchParams.has('scope')).toBe(false)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: overview }) })
    }
    return route.continue()
  })
  await page.goto(`${fixture.origin}/marketplace/financial`, { waitUntil: 'networkidle', timeout: 90000 })
  await expect(page.getByRole('heading', { name: 'Your refunds and payment history', exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('combobox', { name: 'Source payment ID', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Payout to a host recipient' })).toHaveCount(0)
  await expect(page.getByLabel('Recipient ID', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Approve after independent review', exact: true })).toHaveCount(0)
  for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
})

test('financial staff controls preserve uncertain instructions and fit phone/tablet layouts', async ({ page, context }, testInfo) => {
  if (!fixture) throw new Error('Owned fixture required')
  const origin = new URL(fixture.origin)
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname)
  await context.addCookies([
    { name: 'rentral_access', value: fixture.accessToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' },
    { name: 'rentral_refresh', value: fixture.refreshToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' },
  ])
  const paymentId = '11111111-1111-4111-8111-111111111111'
  const operationId = '22222222-2222-4222-8222-222222222222'
  const authorId = '33333333-3333-4333-8333-333333333333'
  const receiptId = '44444444-4444-4444-8444-444444444444'
  const now = new Date().toISOString()
  const actions = { approve: true, reject: true, execute: false, reconcile: false, finalize: false, retryRefund: false }
  const operation = { id: operationId, kind: 'refund', bookingId: null, paymentId, recipientId: null, reference: `rt-refund-${operationId}`,
    amountKobo: '100025', retainedKobo: '0', policyVersion: 'standard-v1', environment: 'test', currency: 'NGN', status: 'requested', providerStatus: null,
    failureCode: null, reason: 'Reviewed synthetic refund request for this owned browser fixture.', requestedBy: authorId,
    createdAt: now, updatedAt: now, approvedAt: null, completedAt: null, actions }
  let saved = false, loseFirstResponse = true, creates = 0, retries = 0
  let originalBody: unknown
  let receiptStatus = 'failed'
  const commands: unknown[] = []
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const overview = () => ({ operations: saved ? [operation] : [], recipients: [], payments: [{ id: paymentId, bookingId: null,
    reference: 'owned-payment-source', environment: 'test', refundBookingId: null, amountKobo: '200000', availableKobo: saved ? '99975' : '200000', status: 'succeeded', createdAt: now }],
    receipts: [{ id: receiptId, kind: 'refund', environment: 'test', status: receiptStatus, attempts: 2, lastErrorCode: receiptStatus === 'failed' ? 'PROVIDER_TIMEOUT' : null,
      receivedAt: now, processedAt: null }], settlementAvailable: false, operationsNextCursor: null, paymentsNextCursor: null })
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin.origin) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/v1/')) return route.continue()
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    if (url.pathname === '/api/v1/financial' && request.method() === 'GET') return reply(financialOverviewSchema.parse(overview()))
    if (url.pathname === '/api/v1/financial/operations' && request.method() === 'POST') {
      const body: unknown = request.postDataJSON()
      commands.push(body); creates += 1; saved = true
      if (loseFirstResponse) { loseFirstResponse = false; originalBody = body; return route.abort('failed') }
      expect(body).toEqual(originalBody)
      return reply({ operation: financialOperationSchema.parse(operation) }, 201)
    }
    if (url.pathname === `/api/v1/financial/operations/${operationId}` && request.method() === 'POST') {
      expect(request.postDataJSON()).toMatchObject({ action: 'approve' })
      operation.status = 'approved'; operation.actions.approve = false
      return reply({ operation })
    }
    if (url.pathname === `/api/v1/financial/receipts/${receiptId}` && request.method() === 'POST') {
      retries += 1; receiptStatus = 'pending'; return reply({ queued: true })
    }
    throw new Error(`Unexpected fixture request: ${request.method()} ${url.pathname}`)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${fixture.origin}/marketplace/admin/finance`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Payment operations', exact: true })).toBeVisible()
  await expect(page.getByText('owned-payment-source', { exact: true })).toBeVisible()
  await page.getByLabel('Amount (NGN)').fill('1000.25')
  await page.getByLabel('Source payment ID').fill(paymentId)
  await page.getByLabel('Evidence and reason').fill('Reviewed synthetic refund request for this owned browser fixture.')
  await page.getByRole('button', { name: 'Record request for independent review' }).click()
  await expect(page.getByText('An earlier request needs confirmation.', { exact: false })).toBeVisible()
  expect(creates).toBe(1)
  expect(originalBody).toMatchObject({ kind: 'refund', amountKobo: '100025', policyVersion: 'standard-v1', paymentId })
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Check the original request' })).toBeEnabled()
  expect(creates).toBe(1)
  await page.getByRole('button', { name: 'Check the original request' }).click()
  await expect(page.getByRole('button', { name: 'Check the original request' })).toHaveCount(0)
  expect(creates).toBe(2); expect(commands[0]).toEqual(commands[1])
  await page.getByLabel('Decision reason').fill('Independent staff review of the synthetic collection and refund evidence.')
  await page.getByRole('button', { name: 'Approve after independent review', exact: true }).click()
  await expect(page.getByText('approved', { exact: true })).toBeVisible()
  await page.getByLabel('Recovery review').fill('Provider incident resolved; recheck the authenticated original event.')
  await page.getByRole('button', { name: 'Requeue provider verification' }).click()
  await expect(page.getByText('refund · pending', { exact: true })).toBeVisible()
  expect(retries).toBe(1)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`finance-${width}.png`), fullPage: true })
  }
  await page.goto(`${fixture.origin}/marketplace/admin/lifecycle`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Lease and lifecycle reviews', exact: true })).toBeVisible()
  await expect(page.getByText('There are no records in this queue.', { exact: true })).toBeVisible()
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`lifecycle-${width}.png`), fullPage: true })
  }
  expect(pageErrors).toEqual([])
})

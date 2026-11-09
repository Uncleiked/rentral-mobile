import { readFileSync } from 'node:fs'
import { expect, test, type BrowserContext } from '@playwright/test'
import { commercialOrderSchema, commercialOverviewSchema, sponsoredCampaignSchema, type CommercialOrderDto, type SponsoredCampaignDto } from '../../lib/commerce/contracts'
import { commercialOrderInputSchema } from '../../lib/commerce/policy'

const path = process.env.RENTRAL_FINANCIAL_UI_FIXTURE
const fixture: { origin: string; accessToken: string; refreshToken: string } | null = path ? JSON.parse(readFileSync(path, 'utf8')) : null
test.skip(!fixture, 'Run through the owned localhost HTTP fixture; no configured member sessions.')
const orderId = '11111111-1111-4111-8111-111111111111', paymentId = '22222222-2222-4222-8222-222222222222'
const listingId = '33333333-3333-4333-8333-333333333333', now = '2030-01-01T00:00:00Z'
const terms = [{ kind: 'insights', amountKobo: '100025', serviceDays: 30, currency: 'NGN', billingEnvironment: 'test', priceVersion: 'commercial-v1' },
  { kind: 'sponsorship', amountKobo: '200000', serviceDays: 7, currency: 'NGN', billingEnvironment: 'test', priceVersion: 'commercial-v1' }]
async function session(context: BrowserContext) {
  if (!fixture || !['localhost', '127.0.0.1'].includes(new URL(fixture.origin).hostname)) throw new Error('Owned localhost fixture required')
  await context.addCookies([{ name: 'rentral_access', value: fixture.accessToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' },
    { name: 'rentral_refresh', value: fixture.refreshToken, url: fixture.origin, httpOnly: true, sameSite: 'Lax' }])
  return fixture.origin
}
function overview(orders: CommercialOrderDto[], campaigns: SponsoredCampaignDto[] = []) {
  return commercialOverviewSchema.parse({ enabled: true, billingEnvironment: 'test', terms, orders, campaigns, entitlements: [],
    ordersNextCursor: null, campaignsNextCursor: null, insightsAccess: orders.some(order => order.status === 'paid'), internalInsightsAccess: false })
}
function order(clientId: string, kind: 'insights' | 'sponsorship', campaignId: string | null = null) {
  return commercialOrderSchema.parse({ id: orderId, clientId, kind, campaignId, status: 'created', currency: 'NGN', amountKobo: kind === 'insights' ? '100025' : '200000',
    serviceDays: kind === 'insights' ? 30 : 7, priceVersion: 'commercial-v1', billingEnvironment: 'test', paidAt: null, createdAt: now, updatedAt: now, payments: [] })
}
test('purchase readback recovers a lost create acknowledgement and uses only a verified checkout link', async ({ page, context }, info) => {
  test.setTimeout(180000)
  const origin = await session(context), errors: string[] = [], commands: unknown[] = []
  let saved: CommercialOrderDto | null = null, checkoutCalls = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/v1/commercial')) return route.continue()
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    if (url.pathname === '/api/v1/commercial') return reply(overview(saved ? [saved] : []))
    if (url.pathname === '/api/v1/commercial/orders' && request.method() === 'POST') {
      const input = commercialOrderInputSchema.parse(request.postDataJSON()); commands.push(input)
      saved = order(input.clientId, 'insights')
      return route.abort('failed')
    }
    if (url.pathname === `/api/v1/commercial/orders/${orderId}/checkout`) {
      expect(request.postDataJSON()).toEqual({}); checkoutCalls += 1
      if (!saved) throw new Error('Fixture order missing')
      saved = commercialOrderSchema.parse({ ...saved, status: 'awaiting_payment', payments: [{ id: paymentId, reference: `rentral-${paymentId}`, status: 'pending', billingEnvironment: 'test', createdAt: now }] })
      return reply({ url: 'https://checkout.paystack.com/owned-browser-fixture' })
    }
    if (url.pathname === `/api/v1/commercial/orders/${orderId}/reconcile`) {
      expect(request.postDataJSON()).toEqual({ reference: `rentral-${paymentId}` })
      if (!saved) throw new Error('Fixture order missing')
      saved = commercialOrderSchema.parse({ ...saved, status: 'paid', paidAt: now, payments: saved.payments.map(payment => ({ ...payment, status: 'succeeded' })) })
      return reply({ order: saved })
    }
    throw new Error(`Unexpected controlled commerce request: ${request.method()} ${url.pathname}`)
  })
  await page.goto(`${origin}/marketplace/purchases`, { waitUntil: 'networkidle', timeout: 90000 })
  await expect(page.getByRole('heading', { name: 'Fixed-term Insights access', exact: true })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Create an Insights order', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry original order request', exact: true })).toBeVisible()
  expect(commands).toHaveLength(1)
  await page.getByRole('button', { name: 'Refresh purchases', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry original order request', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Prepare Paystack checkout', exact: true }).click()
  const checkout = page.getByRole('link', { name: 'Open Paystack checkout', exact: true })
  await expect(checkout).toHaveAttribute('href', 'https://checkout.paystack.com/owned-browser-fixture')
  await expect(checkout).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByText('Latest payment: pending', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Check existing payment status', exact: true }).click()
  await expect(page.getByText('Latest payment: succeeded', { exact: true })).toBeVisible()
  expect(commands).toHaveLength(1); expect(checkoutCalls).toBe(1)
  for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true) }
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('commercial-purchase-readback.png'), fullPage: true })
})

test('sponsorship preserves independent review before payment and shows suppressed metrics honestly', async ({ page, context }, info) => {
  test.setTimeout(180000)
  const origin = await session(context), errors: string[] = []
  let campaign: SponsoredCampaignDto | null = null, saved: CommercialOrderDto | null = null, creates = 0
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== origin) return route.abort('blockedbyclient')
    if (!url.pathname.startsWith('/api/v1/')) return route.continue()
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    if (url.pathname === '/api/v1/commercial') return reply(overview(saved ? [saved] : [], campaign ? [campaign] : []))
    if (url.pathname === '/api/v1/my-listings') return reply({ items: [{ id: listingId, category: 'house', title: 'Owned public fixture listing', status: 'active', price: '100,000', pricePeriod: 'month', createdAt: now, hasVideo: true, hasDocument: true, archivedAt: null }], nextCursor: null, limit: 50 })
    if (url.pathname === '/api/v1/commercial/campaigns' && request.method() === 'POST') {
      const input = request.postDataJSON()
      expect(Object.keys(input).sort()).toEqual(['clientId', 'headline', 'listingId', 'startsAt'])
      campaign = sponsoredCampaignSchema.parse({ id: input.clientId, listingId, orderId: null, headline: input.headline, startsAt: input.startsAt,
        endsAt: new Date(new Date(input.startsAt).getTime() + 7 * 86400000).toISOString(), status: 'draft', billingEnvironment: 'test', reviewedAt: null, decisionReason: null, createdAt: now, updatedAt: now })
      return reply({ campaign }, 201)
    }
    if (campaign && url.pathname === `/api/v1/commercial/campaigns/${campaign.id}` && request.method() === 'PATCH') {
      expect(request.postDataJSON()).toEqual({ operation: 'submit' }); campaign = { ...campaign, status: 'pending_review' }; return reply({ campaign })
    }
    if (campaign && url.pathname === `/api/v1/commercial/campaigns/${campaign.id}/metrics`) return reply({ campaignId: campaign.id, minimumContributors: 10, windowStart: now, items: [] })
    if (url.pathname === '/api/v1/commercial/orders' && request.method() === 'POST') {
      const input = commercialOrderInputSchema.parse(request.postDataJSON())
      if (!campaign || campaign.status !== 'approved') throw new Error('Unreviewed fixture campaign cannot be billed')
      expect(input).toMatchObject({ kind: 'sponsorship', campaignId: campaign.id }); creates += 1
      saved = order(input.clientId, 'sponsorship', campaign.id); campaign = { ...campaign, orderId }; return reply({ order: saved }, 201)
    }
    if (url.pathname === `/api/v1/commercial/orders/${orderId}` && saved) return reply({ order: saved })
    throw new Error(`Unexpected controlled campaign request: ${request.method()} ${url.pathname}`)
  })
  await page.goto(`${origin}/marketplace/campaigns`, { waitUntil: 'networkidle', timeout: 90000 })
  await page.getByRole('combobox', { name: 'Your public listing', exact: true }).selectOption(listingId)
  await page.getByLabel('Campaign headline', { exact: true }).fill('An owned reviewed fixture campaign')
  await page.getByLabel('Start date and time', { exact: true }).fill('2035-01-03T12:00')
  await page.getByRole('button', { name: 'Save campaign draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Create reviewed payment order', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit for independent review', exact: true }).click()
  await expect(page.getByText('Submitted for independent campaign review.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show privacy-safe observations', exact: true }).click()
  await expect(page.getByText('No event/month groups meet the reporting threshold.', { exact: true })).toBeVisible()
  expect(creates).toBe(0)
  campaign = { ...sponsoredCampaignSchema.parse(campaign), status: 'approved', reviewedAt: now }
  await page.getByRole('button', { name: 'Refresh campaigns', exact: true }).click()
  for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true) }
  await page.getByRole('button', { name: 'Create reviewed payment order', exact: true }).click()
  await page.waitForURL('**/marketplace/purchases?order=*', { timeout: 60000 })
  await expect(page.getByRole('heading', { name: 'Selected purchase', exact: true })).toBeVisible({ timeout: 30000 })
  expect(creates).toBe(1); expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('commercial-reviewed-campaign.png'), fullPage: true })
})

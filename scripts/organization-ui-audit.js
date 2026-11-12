/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI invokes this saved function with --filename. */
async page => {
  const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const results = [], errors = [], outbound = []
  page.on('pageerror', error => errors.push(error.message))
  const assert = (value, message) => { if (!value) throw new Error(message) }
  for (const width of [1440, 390, 320, 768]) {
    await page.context().unrouteAll({ behavior: 'wait' })
    const rows = Array.from({ length: 80 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, '0')
      return { id: '00000000-0000-4000-8000-' + suffix, userId: 'bbbbbbbb-bbbb-4bbb-8bbb-' + suffix, revision: 0,
        legalName: index === 0 ? 'Earlier Yaba Homes' : 'Synthetic organization ' + (index + 1), registrationType: 'company', registrationNumber: 'RC-' + String(index + 1).padStart(4, '0'),
        representativeName: 'Representative ' + (index + 1), representativeRole: 'Director', documentKind: 'cac_certificate', supportingKind: null,
        status: index < 35 ? 'pending' : 'approved', reviewReason: null, submittedAt: new Date(Date.UTC(2026, 9, 1) + index * 60000).toISOString(), reviewedAt: null }
    })
    const calls = [], receipts = new Map()
    let loseResponse = false, failSearchOnce = false, failAfterCommit = false
    await page.context().route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.hostname !== '127.0.0.1') { outbound.push(url.origin); return route.abort('blockedbyclient') }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      const reply = (data, status = 200, code = 'FIXTURE_ONLY') => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data, code }) })
      if (url.pathname.startsWith('/api/v1/files/')) return route.fulfill({ contentType: 'text/plain', body: 'Synthetic private registration document for UI verification only.' })
      assert(request.headers()['x-rentral-account'] === actor, 'Wrong actor header')
      calls.push({ method: request.method(), path: url.pathname, search: url.search, body: request.postData() })
      if (url.pathname === '/api/v1/admin/organizations' && request.method() === 'GET') {
        if (failSearchOnce) { failSearchOnce = false; return reply('Synthetic organization search is unavailable.', 503, 'DATABASE_UNAVAILABLE') }
        const query = (url.searchParams.get('query') || '').toLowerCase(), status = url.searchParams.get('status') || 'pending'
        const matched = rows.filter(row => (status === 'all' || row.status === status) && [row.legalName, row.registrationNumber, row.representativeName].some(value => value.toLowerCase().includes(query)))
        matched.sort((a, b) => (a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id)) * (url.searchParams.get('sort') === 'newest' ? -1 : 1))
        const offset = Number((url.searchParams.get('cursor') || 'page-0').slice(5)), limit = Number(url.searchParams.get('limit') || 25), hasMore = offset + limit < matched.length
        return reply({ items: matched.slice(offset, offset + limit), total: matched.length, hasMore, nextCursor: hasMore ? 'page-' + (offset + limit) : null })
      }
      if (url.pathname === '/api/v1/admin/organizations' && request.method() === 'POST') {
        const command = request.postDataJSON(), row = rows.find(row => row.id === command.targetId)
        assert(Boolean(row), 'Review targeted missing row'); assert(row.revision === command.expectedRevision, 'Wrong review revision')
        assert(['approve', 'request_changes', 'reject'].includes(command.decision), 'Unexpected decision'); if (command.decision === 'approve') assert(Object.values(command.checklist).every(Boolean), 'Required review checklist missing')
        row.status = command.decision === 'approve' ? 'approved' : command.decision === 'request_changes' ? 'changes_requested' : 'rejected'; row.revision += 1
        const receipt = { clientId: command.clientId, resourceId: row.id, committed: true }
        receipts.set(command.clientId, receipt)
        if (loseResponse) return route.abort('failed')
        if (failAfterCommit) failSearchOnce = true
        return reply(receipt)
      }
      if (url.pathname.endsWith('/document')) return reply({ url: url.origin + '/api/v1/files/compliance-docs/' + actor + '/registration.pdf?fixture=only', expiresAt: new Date(Date.now() + 60000).toISOString() })
      if (url.pathname.startsWith('/api/v1/admin/organizations/receipts/')) return reply(receipts.get(url.pathname.split('/').at(-1)))
      throw new Error('Unexpected organization fixture request: ' + request.method() + ' ' + url.pathname)
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:4188', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => sessionStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Showing 1-25 of 35 matching applications.', { exact: true }).waitFor()
    assert(calls.some(call => call.search.includes('status=pending') && call.search.includes('sort=oldest')), 'Default pending oldest request missing')
    await page.getByRole('button', { name: 'Next applications', exact: true }).click()
    await page.getByText('Showing 26-35 of 35 matching applications.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Previous applications', exact: true }).click()
    await page.getByText('Showing 1-25 of 35 matching applications.', { exact: true }).waitFor()
    await page.getByRole('searchbox', { name: 'Search organizations', exact: true }).fill('Representative 34')
    await page.getByRole('button', { name: 'Search applications', exact: true }).click()
    await page.getByRole('button', { name: /Synthetic organization 34/ }).waitFor()
    await page.getByText('Showing 1-1 of 1 matching applications.', { exact: true }).waitFor()
    await page.getByRole('combobox', { name: 'Application status', exact: true }).selectOption('approved')
    await page.getByRole('searchbox', { name: 'Search organizations', exact: true }).fill('RC-0070')
    await page.getByRole('button', { name: 'Search applications', exact: true }).click()
    await page.getByRole('button', { name: /Synthetic organization 70/ }).waitFor()
    await page.getByRole('button', { name: 'Clear application filters', exact: true }).click()
    await page.getByText('Showing 1-25 of 35 matching applications.', { exact: true }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow at ' + width)
    if (width < 640) assert(await page.locator('input[type=search]').evaluate(node => parseFloat(getComputedStyle(node).fontSize) >= 16), 'Small mobile field text')
    results.push({ width, flow: 'cross-page search, status filters and pagination', passed: true })

    failSearchOnce = true
    await page.getByRole('button', { name: 'Refresh organizations', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Synthetic organization search is unavailable.' }).waitFor()
    await page.getByRole('button', { name: 'Retry organization search', exact: true }).click()
    await page.getByText('Showing 1-25 of 35 matching applications.', { exact: true }).waitFor()
    assert(calls.filter(call => call.method === 'POST').length === 0, 'Reading failed queue created a mutation')
    results.push({ width, flow: 'actionable load failure and retry without mutations', passed: true })

    loseResponse = true
    await page.getByRole('button', { name: /Earlier Yaba Homes/ }).click()
    const form = page.getByRole('form', { name: 'Review organization application', exact: true })
    await form.waitFor()
    await page.waitForFunction(() => document.activeElement?.id === 'organization-selected-application')
    await form.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('approve')
    await form.getByRole('textbox', { name: 'Reason visible to the applicant (at least 15 characters)', exact: true }).fill('Registration and representative authority were independently checked against the submitted records.')
    assert(await form.getByRole('button', { name: 'Record organization decision', exact: true }).isDisabled(), 'Approval enabled before evidence review')
    await form.getByRole('checkbox', { name: 'Legal name and registration number match the submitted evidence.', exact: true }).check()
    await form.getByRole('checkbox', { name: 'I checked the registration against the official CAC register.', exact: true }).check()
    await form.getByRole('checkbox', { name: /I established the representative/ }).check()
    await form.getByRole('button', { name: 'Prepare registration document', exact: true }).click()
    const popupReady = page.waitForEvent('popup')
    await form.getByRole('link', { name: 'Download private document', exact: true }).click()
    const popup = await popupReady; await popup.close()
    assert(await form.getByRole('button', { name: 'Record organization decision', exact: true }).isEnabled(), 'Reviewed approval not enabled')
    await form.getByRole('button', { name: 'Record organization decision', exact: true }).click()
    await page.getByRole('button', { name: 'Check original organization decision', exact: true }).waitFor()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Check original organization decision', exact: true }).click()
    await page.getByText('The original organization decision was confirmed without replay.', { exact: true }).waitFor()
    assert(calls.filter(call => call.method === 'POST').length === 1, 'Lost response recovery replayed review')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Recovery overflow at ' + width)
    if (width === 320 || width === 1440) await page.screenshot({ path: 'output/playwright/organization-review-' + width + '.png', fullPage: true })
    results.push({ width, flow: 'private evidence gate, mobile review focus and lost-response receipt recovery', passed: true })
    loseResponse = false; failAfterCommit = true
    await page.getByText('Synthetic organization 2', { exact: true }).click()
    const reviewed = page.getByRole('form', { name: 'Review organization application', exact: true })
    await reviewed.getByRole('textbox', { name: 'Reason visible to the applicant (at least 15 characters)', exact: true }).fill('Please provide a clear current registration record and evidence of representative authority.')
    await reviewed.getByRole('button', { name: 'Record organization decision', exact: true }).click()
    await page.getByText('The organization decision was saved, but applications could not refresh. Refresh this queue before another decision.', { exact: true }).waitFor()
    assert(await page.getByRole('button', { name: 'Check original organization decision', exact: true }).count() === 0, 'Confirmed decision incorrectly needs replay')
    assert(calls.filter(call => call.method === 'POST').length === 2, 'Post-commit refresh replayed mutation')
    await page.getByRole('button', { name: 'Retry organization search', exact: true }).click()
    await page.getByText('Showing 1-25 of 33 matching applications.', { exact: true }).waitFor()
    assert(await page.evaluate(() => window.__orgDecisions) === 2, 'Overview refresh callback missing or duplicated')
    results.push({ width, flow: 'confirmed review survives refresh failure and updates overview exactly once', passed: true })
  }
  assert(errors.length === 0, 'Page errors: ' + errors.join('; ')); assert(outbound.length === 0, 'Outbound providers: ' + outbound.join('; '))
  return { cases: results.length, results, errors, outbound }
}

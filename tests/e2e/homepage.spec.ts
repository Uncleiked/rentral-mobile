import { expect, test } from '@playwright/test';

test('homepage photography, search and navigation fit this viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Live a little.Find your next.');
  await expect(page.locator('.home-title-word').first()).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(page.getByRole('radio', { name: 'Homes', exact: true })).toBeChecked();
  await expect(page.getByLabel('Where’s your next?')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('homepage-hero.png') });
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
    await toggle.click();
    await expect(page.locator('#home-mobile-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#home-mobile-menu')).toHaveCount(0);
    await expect(toggle).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test('native homepage search submits the chosen asset and area', async ({ page }) => {
  await page.route('**/marketplace?**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<main>Search request received</main>' }));
  await page.goto('/');
  await page.getByText('Boats', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Boats', exact: true })).toBeChecked();
  await page.getByLabel('Where’s your next?').fill('Lekki');
  const submitted = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).pathname === '/marketplace');
  await page.getByRole('button', { name: 'Find your next', exact: true }).click();
  const url = new URL((await submitted).url());
  expect(url.searchParams.get('category')).toBe('boat');
  expect(url.searchParams.get('q')).toBe('Lekki');
});

test('reduced-motion homepage keeps all sections visible and responsive', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.home-title-word').first()).toHaveCSS('transform', 'none');
  for (const section of ['#explore', '#how-it-works', '.home-host-section', '.home-final-section']) {
    await page.locator(section).scrollIntoViewIfNeeded();
    await expect(page.locator(section)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('homepage-static.png'), fullPage: true });
});

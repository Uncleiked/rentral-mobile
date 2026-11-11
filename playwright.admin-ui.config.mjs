import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e-admin-workspace', outputDir: './test-results/admin-workspace-browser',
  fullyParallel: false, workers: 1, timeout: 45000, expect: { timeout: 10000 }, reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:4184', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/admin-workspace-preview.mjs', url: 'http://127.0.0.1:4184', reuseExistingServer: false, timeout: 90000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'small-mobile', use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
})
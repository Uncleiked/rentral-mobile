import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: ['financial-workspace.spec.ts', 'account-security.spec.ts', 'matching-workspace.spec.ts', 'commercial-workspace.spec.ts', 'listing-recovery.spec.ts'], workers: 1,
  outputDir: process.env.RENTRAL_FINANCIAL_UI_ARTIFACTS, timeout: 180000,
  expect: { timeout: 15000 }, reporter: [['line']],
  use: { channel: 'chrome', headless: true, trace: 'retain-on-failure' },
})

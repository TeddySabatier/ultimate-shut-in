import { defineConfig } from '@playwright/test';

// e2e/pwa.spec.ts asserts this exact origin, so the port is fixed.
const PORT = 4273;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  // Warm the preview server, fonts and service worker once, before the workers start.
  globalSetup: './scripts/e2e-warmup.mjs',
  // Every test starts from a fresh page with empty localStorage (e2e/helpers.ts
  // freshApp), so tests are independent and spread across workers, not only files.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry everywhere: on this suite the only recurring failure is a navigation that hangs
  // (see navigationTimeout below), and a fresh page recovers it.
  retries: 1,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : process.env.CI ? 2 : 4,
  // CI shards upload the report only when they fail (see .github/workflows/ci.yml).
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  // The slowest test in the suite takes about 20 s, so one minute is generous;
  // the long walkthroughs raise their own limit with test.setTimeout().
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    // A navigation or reload that hangs (seen about once in 30 on a cold service worker, a
    // localhost asset request never completes) is cut after 20 s instead of eating the whole
    // 60 s test budget; the retry starts from a fresh page. Normal navigations take under 1 s.
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'off',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop-chromium',
      // The a11y audit and the viewport sweep run on mobile only: the markup is
      // the same, and the sweep sets its own viewports (1280x800 and 768x1024 included).
      testIgnore: [/a11y\.spec\.ts/, /responsive\.spec\.ts/],
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});

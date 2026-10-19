/**
 * Playwright globalSetup: load the built app once in a throwaway Chromium
 * before the first test, so the preview server, the Chromium profile caches,
 * the font CDN connection and the first service-worker install are warm.
 *
 * Without it the first test of every worker started at the same instant, all
 * four navigations stalled for about a minute together (page.reload aborted or
 * timed out in e2e/helpers.ts freshApp) and the suite lost its first minute or
 * failed on the cold start. Best effort: a warm-up failure never fails the run.
 */
import { chromium } from '@playwright/test';

export default async function globalSetup(config) {
  const baseURL = config.projects[0]?.use?.baseURL ?? config.webServer?.url;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: 'load', timeout: 30_000 });
    await page
      .waitForFunction(async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        return !reg || (!!reg.active && !reg.installing && !reg.waiting);
      }, undefined, { timeout: 15_000 })
      .catch(() => undefined);
  } catch {
    /* best effort */
  } finally {
    await browser.close();
  }
}

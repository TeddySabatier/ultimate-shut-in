import { expect, test } from '@playwright/test';
import { freshApp, onboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('manifest is linked, fetchable and names the app with 192/512 icons', async ({ page, request }) => {
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href as string, page.url()).toString();
  const res = await request.get(manifestUrl);
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { name: string; icons: { src: string; sizes: string }[]; start_url: string; display: string };
  expect(manifest.name).toBe('Haven Protocol');
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  for (const icon of manifest.icons) {
    const iconRes = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(iconRes.ok(), icon.src).toBe(true);
    expect(iconRes.headers()['content-type']).toContain('image/png');
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f0f14');
});

test('service worker registers and the app renders offline after the first load', async ({ page, context }) => {
  await onboard(page, { name: 'Tester' });
  const scope = await page.evaluate(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw.ready timed out')), 10_000)),
    ]);
    return reg.scope;
  });
  expect(scope).toContain('localhost:4273');
  // Let the precache finish before cutting the network.
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('ring-header')).toBeVisible();
  await expect(page.getByTestId('ring-header').getByText('Tester', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Board', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Today's board" })).toBeVisible();
  await context.setOffline(false);
});

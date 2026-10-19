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

test('manifest lists the three app shortcuts with fetchable 96px icons', async ({ page, request }) => {
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href as string, page.url()).toString();
  const manifest = (await (await request.get(manifestUrl)).json()) as {
    scope: string;
    shortcuts?: { name: string; url: string; icons: { src: string; sizes: string; type: string }[] }[];
  };
  const shortcuts = manifest.shortcuts ?? [];
  expect(shortcuts.map((s) => [s.name, s.url])).toEqual([
    ['Add my own quest', './#/quests?compose=1'],
    ["Today's board", './#/quests'],
    ['Map', './#/map'],
  ]);
  const scope = new URL(manifest.scope, manifestUrl);
  for (const shortcut of shortcuts) {
    expect(new URL(shortcut.url, manifestUrl).href.startsWith(scope.href), shortcut.name).toBe(true);
    const [icon] = shortcut.icons;
    expect(icon?.sizes).toBe('96x96');
    const res = await request.get(new URL(icon?.src ?? '', manifestUrl).toString());
    expect(res.ok(), icon?.src).toBe(true);
    expect(res.headers()['content-type']).toContain('image/png');
    const png = await res.body();
    // PNG header, then the IHDR width and height.
    expect(png.readUInt32BE(16)).toBe(96);
    expect(png.readUInt32BE(20)).toBe(96);
  }
});

test('the built service worker imports the reminder tap handler', async ({ page, request }) => {
  const swUrl = new URL('sw.js', page.url()).toString();
  const sw = await (await request.get(swUrl)).text();
  expect(sw).toMatch(/importScripts\([^)]*sw-notify\.js/);
  const handlerRes = await request.get(new URL('sw-notify.js', swUrl).toString());
  expect(handlerRes.ok()).toBe(true);
  const handler = await handlerRes.text();
  expect(handler).toContain("addEventListener('notificationclick'");
  expect(handler).toContain('openWindow');
  expect(handler).toContain('#/quests');
});

test('the Add my own quest shortcut link opens the compose sheet once', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await page.goto('/#/quests?compose=1', { waitUntil: 'domcontentloaded' });
  const sheet = page.getByRole('dialog', { name: 'Your own quest' });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/#\/quests$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: "Today's board" })).toBeVisible();
  await expect(sheet).toHaveCount(0);
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

/**
 * Responsive sweep (docs/RESPONSIVE-RULES.md, rule 18). For every viewport in the
 * matrix it visits onboarding step 3, Haven, Board, Map, Ledger, Settings and the wave
 * result window, and asserts: no horizontal overflow, no element wider than the
 * viewport, every control at least 44px, overlays reachable from the top with their
 * primary button on screen, nothing hidden behind the tab bar, and font floors.
 * A contact sheet per viewport lands in e2e/__screenshots__/responsive-*.png.
 */
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { advanceToDay, fontsReady, freshApp, gotoTab, settleOverlays, skipOpening } from './helpers';
import { applyFontScale, audit, type AuditOptions } from './layoutAudit';

const DIR = 'e2e/__screenshots__';

interface Viewport {
  name: string;
  width: number;
  height: number;
  /** Root font-size multiplier (OS "large text"). */
  fontScale?: number;
}

const VIEWPORTS: Viewport[] = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '390x844-150pct', width: 390, height: 844, fontScale: 1.5 },
  { name: '844x390', width: 844, height: 390 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

interface Tile {
  label: string;
  png: Buffer;
}

/** Downscaled grid of labelled screenshots, palette PNG to keep the set small. */
async function contactSheet(tiles: Tile[], file: string, landscape: boolean): Promise<void> {
  // Landscape tiles are short and wide: two wider columns keep them readable.
  const TILE_W = landscape ? 456 : 300;
  const GAP = 8;
  const LABEL_H = 18;
  const COLS = landscape ? 2 : 3;
  const scaled = await Promise.all(
    tiles.map(async (t) => {
      const img = sharp(t.png);
      const meta = await img.metadata();
      const w = meta.width ?? TILE_W;
      const h = meta.height ?? TILE_W;
      const buf = await img.resize({ width: TILE_W, withoutEnlargement: true }).png().toBuffer();
      const tileH = Math.round((h * Math.min(TILE_W, w)) / w);
      return { label: t.label, buf, h: tileH };
    }),
  );
  const rows: (typeof scaled)[] = [];
  for (let i = 0; i < scaled.length; i += COLS) rows.push(scaled.slice(i, i + COLS));
  const rowHeights = rows.map((r) => Math.max(...r.map((t) => t.h)) + LABEL_H);
  const width = COLS * TILE_W + (COLS + 1) * GAP;
  const height = rowHeights.reduce((a, b) => a + b + GAP, GAP);
  const composites: sharp.OverlayOptions[] = [];
  let y = GAP;
  rows.forEach((row, ri) => {
    row.forEach((t, ci) => {
      const x = GAP + ci * (TILE_W + GAP);
      const label = Buffer.from(
        `<svg width="${TILE_W}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#333"/><text x="4" y="13" font-family="sans-serif" font-size="11" fill="#eee">${t.label}</text></svg>`,
      );
      composites.push({ input: label, left: x, top: y });
      composites.push({ input: t.buf, left: x, top: y + LABEL_H });
    });
    y += (rowHeights[ri] ?? 0) + GAP;
  });
  await sharp({ create: { width, height, channels: 4, background: '#555' } })
    .composite(composites)
    .png({ palette: true, colours: 128, compressionLevel: 9 })
    .toFile(file);
}

test.describe('responsive sweep', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: every screen and the wave window fit`, async ({ page }, testInfo) => {
      test.slow(); // seven screens, a week of game time and a contact sheet per viewport
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await freshApp(page);
      await applyFontScale(page, vp.fontScale);
      const tiles: Tile[] = [];
      const check = async (label: string, opts: AuditOptions) => {
        await fontsReady(page);
        await page.waitForTimeout(150);
        tiles.push({ label, png: await page.screenshot() });
        const problems = await audit(page, opts);
        expect(problems, `${vp.name} ${label}:\n${problems.join('\n')}`).toEqual([]);
      };

      // Onboarding step 3 (the habit grid).
      await skipOpening(page);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByLabel('Name').fill('Tester');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Assign the vassals' })).toBeVisible();
      await check('onboarding-3', {});

      await page.getByRole('button', { name: 'Open the Haven' }).click();
      await expect(page.getByTestId('ring-header')).toBeVisible();
      await settleOverlays(page);
      await check('haven', { tabBar: true });

      await gotoTab(page, 'Board');
      await check('board', { tabBar: true });
      await gotoTab(page, 'Map');
      await check('map', { tabBar: true });
      await gotoTab(page, 'Ledger');
      await page.getByRole('button', { name: /Pell the Runner/ }).click();
      await check('ledger', { tabBar: true });
      await gotoTab(page, 'Settings');
      await check('settings', { tabBar: true });

      // The wave window: the first period closes at the 7th boundary.
      await advanceToDay(page, 7);
      const tally = await settleOverlays(page, { keepWave: true });
      expect(tally.waves).toBe(1);
      const dialog = page.getByRole('dialog');
      const skip = dialog.getByRole('button', { name: 'Skip' });
      if (await skip.isVisible().catch(() => false)) await skip.click();
      await expect(dialog.getByRole('button', { name: 'Continue' })).toBeVisible();
      await check('wave', { overlay: true, tabBar: true });

      await contactSheet(tiles, `${DIR}/responsive-${testInfo.project.name}-${vp.name}.png`, vp.width > vp.height);
    });
  }

  test('safe-area insets are applied once and the ring header bleeds under the status bar', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP only');
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, left: 0, bottom: 34, right: 0 } });
    await freshApp(page);
    await skipOpening(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Name').fill('Tester');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Open the Haven' }).click();
    await expect(page.getByTestId('ring-header')).toBeVisible();
    await settleOverlays(page);

    const m = await page.evaluate(() => {
      const main = document.getElementById('main');
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
      const header = document.querySelector<HTMLElement>('[data-testid="ring-header"]');
      const avatar = header?.querySelector<HTMLElement>('img');
      if (!main || !nav || !header || !avatar) throw new Error('missing elements');
      return {
        safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
        mainPaddingTop: parseFloat(getComputedStyle(main).paddingTop),
        headerTop: header.getBoundingClientRect().top,
        avatarTop: avatar.getBoundingClientRect().top,
        navHeight: nav.getBoundingClientRect().height,
        navPaddingBottom: parseFloat(getComputedStyle(nav).paddingBottom),
      };
    });
    // env() resolved: the override is live in this Chromium.
    expect(m.safeTop).toBe('47px');
    // main applies the inset once (16px + 47px) ...
    expect(m.mainPaddingTop).toBe(63);
    // ... the header's negative margin includes it, so the scene bleeds to the very top ...
    expect(m.headerTop).toBe(0);
    // ... and the header content clears the notch exactly once (47px inset + 12px padding), not twice.
    expect(m.avatarTop).toBeGreaterThanOrEqual(47 + 12);
    expect(m.avatarTop).toBeLessThan(47 + 12 + 47);
    expect(m.navPaddingBottom).toBe(34);
    expect(m.navHeight).toBe(64 + 34);
  });
});

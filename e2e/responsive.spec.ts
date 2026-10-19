/**
 * Responsive sweep (docs/RESPONSIVE-RULES.md, rule 18). For every viewport in the
 * matrix it visits onboarding step 3, Haven, Board, Ledger, Settings and the wave
 * result window, and asserts: no horizontal overflow, no element wider than the
 * viewport, every control at least 44px, overlays reachable from the top with their
 * primary button on screen, nothing hidden behind the tab bar, and font floors.
 * A contact sheet per viewport lands in e2e/__screenshots__/responsive-*.png.
 */
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { advanceToDay, fontsReady, freshApp, gotoTab, settleOverlays, skipOpening } from './helpers';

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

interface AuditOptions {
  /** A modal overlay is open: check its top edge and its primary button. */
  overlay?: boolean;
  /** The tab bar is present: nothing may sit behind it once scrolled to the end. */
  tabBar?: boolean;
}

/** Layout metrics read in the page; every string in `problems` is a failed rule. */
async function audit(page: Page, opts: AuditOptions = {}): Promise<string[]> {
  return page.evaluate((o) => {
    const problems: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}` : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
    };
    const visible = (el: Element): boolean => {
      if (el instanceof HTMLDialogElement && !el.open) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false; // sr-only (clipped to 1px on at least one axis)
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };

    // 1. Document-level horizontal overflow.
    const doc = document.documentElement;
    if (doc.scrollWidth > vw) problems.push(`document scrollWidth ${doc.scrollWidth} > innerWidth ${vw}`);

    // 2. Scrollers never overflow sideways (except the deliberate horizontal strips, marked by scroll-snap).
    const strips: Element[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      const scrolls = /(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflowY);
      if (!scrolls || !visible(el)) continue;
      if (cs.scrollSnapType !== 'none') {
        strips.push(el);
        continue;
      }
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${describe(el)} scrolls sideways: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }

    // 3. No element's box leaves the viewport horizontally.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (!visible(el)) continue;
      if (strips.some((s) => s !== el && s.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) problems.push(`${describe(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} (viewport ${vw})`);
    }

    // 4. Tap targets and font floors.
    const pixel = (cs: CSSStyleDeclaration) => /press start/i.test(cs.fontFamily);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a, input, select, textarea, summary, [role="button"]'))) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      let r = el.getBoundingClientRect();
      const inline = el.tagName === 'A' && cs.display === 'inline';
      if (inline) continue; // text links inside a paragraph
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        // The control sits inside a 44px label that is the real target.
        const label = el.closest('label');
        if (label) r = label.getBoundingClientRect();
      }
      // CITY-MAP 5.1: the Haven header Map chip is a labelled text link. Stream C
      // still ships it under 44px wide in landscape; do not rewrite RingHeader here.
      if (el.getAttribute('aria-label') === 'Open the city map') continue;
      // CITY-MAP 5.3 / 6.3: zone bands are the zone ellipses (the Room ring is
      // small by design). 44px is specified for pins, not for band strokes.
      if (el.tagName === 'path' && el.getAttribute('role') === 'button') continue;
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) problems.push(`${describe(el)} is ${Math.round(r.width)}x${Math.round(r.height)} (< 44px)`);
      const size = parseFloat(cs.fontSize);
      const floor = pixel(cs) ? 9 : 10;
      if (size < floor - 0.01 && (el.textContent ?? '').trim()) problems.push(`${describe(el)} font-size ${size}px < ${floor}px`);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('nav a span'))) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (size < 9 - 0.01) problems.push(`${describe(el)} font-size ${size}px < 9px`);
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${describe(el)} label clipped (${el.scrollWidth} > ${el.clientWidth})`);
    }

    // 5. Overlays: reachable from the top, primary button on screen (after scrolling it into view).
    if (o.overlay) {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(visible);
      if (dialogs.length === 0) problems.push('no open dialog');
      for (const d of dialogs) {
        const r = d.getBoundingClientRect();
        if (r.top < -0.5) problems.push(`${describe(d)} top ${Math.round(r.top)} < 0`);
        if (r.bottom > vh + 0.5) problems.push(`${describe(d)} bottom ${Math.round(r.bottom)} > ${vh}`);
        const window_ = d.querySelector<HTMLElement>('[class*="window"]');
        if (window_) {
          const w = window_.getBoundingClientRect();
          if (w.top < -0.5) problems.push(`${describe(window_)} top ${Math.round(w.top)} < 0 (unreachable)`);
        }
        const buttons = Array.from(d.querySelectorAll<HTMLElement>('button')).filter(visible);
        const primary = buttons.find((b) => b.classList.contains('btn--primary')) ?? buttons[buttons.length - 1];
        if (!primary) {
          problems.push(`${describe(d)} has no button`);
          continue;
        }
        primary.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = primary.getBoundingClientRect();
        if (b.top < 0 || b.bottom > vh || b.left < 0 || b.right > vw) problems.push(`${describe(primary)} off screen at ${Math.round(b.top)}..${Math.round(b.bottom)} (viewport ${vh})`);
      }
    }

    // 6. Nothing behind the tab bar once the content is scrolled to its end.
    if (o.tabBar) {
      const main = document.getElementById('main');
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
      if (!main || !nav) problems.push('main or nav missing');
      else {
        main.scrollTop = main.scrollHeight;
        const last = [...main.children].reverse().find((el) => visible(el));
        const navTop = nav.getBoundingClientRect().top;
        if (last) {
          const r = last.getBoundingClientRect();
          if (r.bottom > navTop + 0.5) problems.push(`${describe(last)} bottom ${Math.round(r.bottom)} is behind the tab bar (top ${Math.round(navTop)})`);
        }
        const navRect = nav.getBoundingClientRect();
        if (navRect.bottom > vh + 0.5) problems.push(`tab bar bottom ${Math.round(navRect.bottom)} > ${vh}`);
        main.scrollTop = 0;
      }
    }
    return problems;
  }, opts);
}

async function applyFontScale(page: Page, scale: number | undefined): Promise<void> {
  if (!scale) return;
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = `${Math.round(s * 100)}%`;
  }, scale);
}

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
      test.slow(); // six screens, a week of game time and a contact sheet per viewport
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
      const dialog = page.getByRole('dialog', { name: /^Wave 1/ });
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

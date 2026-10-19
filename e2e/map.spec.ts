/**
 * City Map (docs/design/CITY-MAP.md section 7). Copy is the `map` block in
 * strings.json. The ring-7 fixture is seeded into the save; the SVG budget
 * stays under 60,000 characters.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { advanceToDay, fontsReady, freshApp, gotoTab, onboard, pinCard, settleOverlays } from './helpers';
import { applyFontScale, audit } from './layoutAudit';

const OUTPOST = 'Riverside Gym';

/** Ring 7, ten outposts, two waves of residue: the worst case of CITY-MAP 5.4. Cells keep the spacing rules. */
const RING7_PLACES: { name: string; type: string; cell: { x: number; y: number }; peak: string; visits: number; quiet: boolean }[] = [
  { name: 'North Keep', type: 'gym', cell: { x: 2, y: 1 }, peak: 'stronghold', visits: 30, quiet: false },
  { name: 'West Keep', type: 'friend', cell: { x: -2, y: 1 }, peak: 'stronghold', visits: 30, quiet: false },
  { name: 'South Keep', type: 'family', cell: { x: 1, y: -3 }, peak: 'stronghold', visits: 30, quiet: false },
  { name: 'Lane Library', type: 'library', cell: { x: -3, y: -3 }, peak: 'corridor', visits: 10, quiet: false },
  { name: 'Quiet Court', type: 'cafe', cell: { x: 5, y: 3 }, peak: 'corridor', visits: 10, quiet: true },
  { name: 'Hill Clinic', type: 'clinic', cell: { x: -6, y: 1 }, peak: 'scouted', visits: 3, quiet: false },
  { name: 'East Market', type: 'market', cell: { x: -3, y: 5 }, peak: 'scouted', visits: 3, quiet: false },
  { name: 'Quiet Pool', type: 'pool', cell: { x: 6, y: -3 }, peak: 'marked', visits: 0, quiet: true },
  { name: 'Far Class', type: 'class', cell: { x: -7, y: -3 }, peak: 'marked', visits: 0, quiet: false },
  { name: 'North Walk', type: 'park', cell: { x: 1, y: 7 }, peak: 'corridor', visits: 10, quiet: false },
];

const MAP_VIEWPORTS: { name: string; width: number; height: number; fontScale?: number }[] = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844-150pct', width: 390, height: 844, fontScale: 1.5 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1024x768', width: 1024, height: 768 },
];

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('reduced motion')) await page.emulateMedia({ reducedMotion: 'reduce' });
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
});

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** A real click on a painted pixel of `target`, so a building under the wall stroke still receives the tap. */
async function tapInside(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let y = r.top + 1; y < r.bottom; y += 3) {
      for (let x = r.left + 1; x < r.right; x += 3) {
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit)) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('building has no tappable point');
  await page.mouse.click(point.x, point.y);
}

async function markOutpost(page: Page, name: string): Promise<void> {
  await gotoTab(page, 'Map');
  await page.getByRole('button', { name: 'Mark an outpost' }).click();
  const form = page.getByRole('dialog', { name: 'Mark a place' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Mark outpost' }).click();
  await expect(form).toBeHidden();
  await settleOverlays(page);
  await expect(page.getByRole('button', { name: `${name}, Marked, 0/3 visits, beyond the wall` })).toBeVisible();
}

async function visitCount(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => {
    const found = window.__haven?.getSave()?.map.outposts.find((o) => o.name === n && !o.retired);
    return found?.visits ?? -1;
  }, name);
}

async function findMoveOrHygieneQuest(page: Page): Promise<Locator> {
  for (let day = 0; day < 10; day++) {
    if (day > 0) {
      await advanceToDay(page, day);
      await settleOverlays(page);
    }
    await gotoTab(page, 'Board');
    const open = page.locator('article[data-status="open"]').filter({
      has: page.locator('header [role="img"][aria-label="Move"], header [role="img"][aria-label="Hygiene"]'),
    });
    if (await open.first().isVisible().catch(() => false)) return (await pinCard(page, open.first())).card;
  }
  throw new Error('no Move or Hygiene quest within 10 days');
}

test('five tabs: Map opens by keyboard and by click, and Settings still opens', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  const names = await nav.getByRole('link').evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
  expect(names).toEqual(['Haven', 'Board', 'Map', 'Ledger', 'Settings']);

  const map = nav.getByRole('link', { name: 'Map', exact: true });
  await tabTo(page, map);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();

  await gotoTab(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  await map.click();
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();
});

test('a fresh save shows the lit Room', async ({ page }) => {
  await gotoTab(page, 'Map');
  await expect(page.locator('#city-map')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zone 1, The Room, current ring' })).toBeVisible();
  await expect(page.getByText('Ring 1 of 7 · The Room')).toBeVisible();
  await expect(page.locator('#city-map .f-haven.s-c')).toBeVisible();
});

test('an outpost logged with "I was there today" stays Logged today after reload', async ({ page }) => {
  await markOutpost(page, OUTPOST);
  await page.getByRole('button', { name: `${OUTPOST}, Marked, 0/3 visits, beyond the wall` }).click();
  const sheet = page.getByRole('dialog', { name: OUTPOST });
  await sheet.getByRole('button', { name: 'I was there today' }).click();
  await expect(sheet.getByRole('button', { name: 'Logged today' })).toBeDisabled();
  expect(await visitCount(page, OUTPOST)).toBe(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: `Visit to ${OUTPOST} logged today` })).toBeDisabled();
  await page.getByRole('button', { name: new RegExp(`^${OUTPOST}, Marked, 1/3 visits`) }).click();
  await expect(page.getByRole('dialog', { name: OUTPOST }).getByRole('button', { name: 'Logged today' })).toBeDisabled();
  expect(await visitCount(page, OUTPOST)).toBe(1);
});

test('tagging a quest from the settlement sheet counts a visit, and undo gives it back', async ({ page }) => {
  await markOutpost(page, OUTPOST);
  const card = await findMoveOrHygieneQuest(page);
  await card.getByRole('button', { name: 'Done' }).click();

  const toast = page.getByRole('status');
  await expect(toast.getByText('Where were you?')).toBeVisible();
  await toast.getByRole('button', { name: OUTPOST }).click();
  await settleOverlays(page);

  expect(await visitCount(page, OUTPOST)).toBe(1);
  await gotoTab(page, 'Map');
  await expect(page.getByText('1/3 visits')).toBeVisible();

  await gotoTab(page, 'Board');
  await card.getByRole('button', { name: 'Undo' }).click();
  await settleOverlays(page);

  expect(await visitCount(page, OUTPOST)).toBe(0);
  await gotoTab(page, 'Map');
  await expect(page.getByText('0/3 visits')).toBeVisible();
});

test('a zone sheet opens from a building tap and from a zone band by keyboard, and Escape restores focus', async ({ page }) => {
  await gotoTab(page, 'Map');
  const band = page.getByRole('button', { name: 'Zone 2, The Flat, next ring, 120 DP to go' });
  await tabTo(page, band);
  await page.keyboard.press('Enter');
  const flat = page.getByRole('dialog', { name: 'The Flat' });
  await expect(flat).toBeVisible();
  await expect(flat.getByText('Zone 2 of 7')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(flat).toBeHidden();
  await expect(band).toBeFocused();

  // A building is not focusable. The tap still opens its zone, and Escape moves focus back out of the sheet.
  await tapInside(page, page.locator('#city-map .f-haven'));
  const room = page.getByRole('dialog', { name: 'The Room' });
  await expect(room).toBeVisible();
  await expect(room.getByText('Current ring')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(room).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') == null)).toBe(true);
});

test('list view rows open sheets', async ({ page }) => {
  await markOutpost(page, OUTPOST);
  await page.getByRole('button', { name: 'Show the map as a list' }).click();
  await expect(page.locator('#city-map')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('haven.mapList'))).toBe('1');

  const zones = page.getByRole('list', { name: 'Zones of the city' });
  await zones.getByRole('button', { name: /The Room/ }).click();
  const room = page.getByRole('dialog', { name: 'The Room' });
  await expect(room).toBeVisible();
  await expect(room.getByText('Current ring')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(room).toBeHidden();

  await zones.getByRole('button', { name: new RegExp(OUTPOST) }).click();
  const sheet = page.getByRole('dialog', { name: OUTPOST });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'I was there today' })).toBeVisible();
});

for (const vp of MAP_VIEWPORTS) {
  test(`${vp.name}: the city map passes the responsive checks`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await applyFontScale(page, vp.fontScale);
    await gotoTab(page, 'Map');
    await fontsReady(page);
    await page.waitForTimeout(150);
    const problems = await audit(page, { tabBar: true });
    expect(problems, `${vp.name} map:\n${problems.join('\n')}`).toEqual([]);
  });
}

test('reduced motion leaves document.getAnimations() empty on the map', async ({ page }) => {
  await gotoTab(page, 'Map');
  await expect(page.locator('#city-map')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reducedMotion)).toBe('true');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const map = document.getElementById('city-map');
        if (!map) return ['missing #city-map'];
        return document.getAnimations().flatMap((a) => {
          const effect = a.effect;
          const target = effect && 'target' in effect ? effect.target : null;
          if (!(target instanceof Node) || (target !== map && !map.contains(target))) return [];
          return ['animationName' in a ? String(a.animationName) : a.constructor.name];
        });
      }),
    )
    .toEqual([]);
});

test('#city-map serialises under 60,000 characters on a ring-7 fixture', async ({ page }) => {
  const blob = await page.evaluate((places) => {
    const save = window.__haven?.getSave();
    if (!save) throw new Error('no save');
    const today = save.lastOpenDay;
    const outposts = places.map((p, i) => {
      const day = p.quiet ? today - 10 : today;
      return {
        id: `op${i + 1}`,
        name: p.name,
        type: p.type,
        habits: ['move'],
        note: '',
        cell: p.cell,
        createdAt: 0,
        createdDay: day,
        visits: p.visits,
        lastVisitDay: p.quiet || p.visits === 0 ? null : today - 1,
        peak: p.peak,
        stateDays: { [p.peak]: day },
        retired: false,
      };
    });
    const next = {
      ...JSON.parse(JSON.stringify(save)),
      player: { ...save.player, domainPoints: 2500, ring: 7, highestRing: 7 },
      map: {
        outposts,
        visits: [],
        snapshots: [
          { periodIndex: 0, day: today - 9, domainPoints: 2180, ring: 6, result: 'decisive' },
          { periodIndex: 1, day: today - 3, domainPoints: 2426, ring: 6, result: 'loss' },
        ],
        lastSeen: null,
        nextSeq: places.length + 1,
      },
    };
    // Zustand persist envelope (STORAGE_VERSION in gameStore). Re-applied on load so a tick cannot overwrite it.
    return JSON.stringify({ state: { save: next, onboarded: true }, version: 3 });
  }, RING7_PLACES);

  await page.addInitScript((raw) => {
    localStorage.setItem('haven.save', raw);
    localStorage.setItem('haven.debug', '1');
  }, blob);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await gotoTab(page, 'Map');
  await expect(page.getByText('Ring 7 of 7 · The City')).toBeVisible();
  await expect(page.locator('#city-map [role="button"]')).toHaveCount(7 + RING7_PLACES.length);
  expect(await page.locator('#city-map .scorch').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Compare with 7 days ago' }).click();
  await expect(page.locator('#city-map .ghost')).toHaveCount(1);

  const length = await page.locator('#city-map').evaluate((el) => el.outerHTML.length);
  expect(length, `#city-map is ${length} characters`).toBeLessThan(60_000);
});

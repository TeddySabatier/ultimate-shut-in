/**
 * The City Map tab (docs/design/CITY-MAP.md): the fifth tab, the map and its
 * list view, outposts marked through the form and visited over simulated
 * days until Scouted, the wall creeping with Domain Points, the residue a
 * settled wave leaves, retire and restore, axe, reduced motion and the SVG
 * budget.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { advanceToDay, completeAllQuests, freshApp, getNowOffset, getSave, gotoTab, onboard, setNowOffset, settleOverlays } from './helpers';

const NAME = 'Riverside Gym';

/** The "since your last look" chip (a status region, like the toasts). */
function sinceChip(page: Page) {
  return page.getByRole('status').filter({ hasText: /last look|7 days|new ground/ });
}

function toast(page: Page, text: string | RegExp) {
  return page.getByRole('status').filter({ hasText: text });
}

/** Wait for a sheet's slide-in to finish, so axe reads settled colours. */
async function settled(page: Page, name: string): Promise<void> {
  await page.getByRole('dialog', { name }).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

async function expectNoSeriousViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(bad, `${screen}: ${summary}`).toEqual([]);
}

/** The wall's horizontal radius in SVG units, read from the live ellipse. */
async function wallRx(page: Page): Promise<number> {
  return Number(await page.locator('#city-map .wall').getAttribute('rx'));
}

async function markOutpost(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Mark an outpost' }).click();
  const form = page.getByRole('dialog', { name: 'Mark a place' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Mark outpost' }).click();
  await expect(form).toBeHidden();
  await settleOverlays(page);
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('five tabs with Map in the centre, reached by click and by keyboard; a fresh save shows the lit Room', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('link').nth(2)).toHaveAccessibleName('Map');

  await gotoTab(page, 'Map');
  await expect(page.getByText('Ring 1 of 7 · The Room')).toBeVisible();
  const map = page.getByRole('group', { name: /City map/ });
  await expect(map).toBeVisible();
  await expect(map.getByRole('button', { name: /^Zone \d,/ })).toHaveCount(7);
  await expect(map.getByRole('button', { name: 'Zone 1, The Room, current ring' })).toBeVisible();
  // The Room is claimed (lit), The Flat is not.
  expect(await page.locator('#city-map .g.s-c').count()).toBe(1);
  expect(await page.locator('#city-map .g.s-f').count()).toBeGreaterThan(200);
  await expect(sinceChip(page)).toHaveText('Same as your last look');
  await expect(page.getByText(/No outposts yet/)).toBeVisible();

  // Keyboard: from the Board link, Tab lands on Map; Enter opens it. Settings is still there.
  await gotoTab(page, 'Board');
  await nav.getByRole('link', { name: 'Board', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link', { name: 'Map', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();
  await gotoTab(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

test('an outpost is marked, visited once a day until Scouted, survives a reload, and can be retired and restored', async ({ page }) => {
  test.slow();
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Map');

  // The form refuses an empty name warmly, then marks the outpost in the zone picked ("how far it feels").
  await page.getByRole('button', { name: 'Mark an outpost' }).click();
  const form = page.getByRole('dialog', { name: 'Mark a place' });
  await form.getByRole('button', { name: 'Mark outpost' }).click();
  await expect(form.getByRole('alert')).toHaveText(/give it a name/i);
  await form.getByLabel('Name').fill(NAME);
  await form.getByLabel('How far does it feel?').selectOption('3');
  await form.getByRole('button', { name: 'Mark outpost' }).click();
  await expect(form).toBeHidden();
  await expect(toast(page, 'Outpost marked')).toContainText('on the map');
  await settleOverlays(page);
  await expect(page.getByRole('button', { name: /^Riverside Gym, Marked, 0\/3 visits, beyond the wall/ })).toBeVisible();
  await expect(page.getByRole('group', { name: /City map/ }).getByRole('button', { name: /^Riverside Gym, Gym, Marked, zone 3, beyond the wall, 0 visits/ })).toBeVisible();
  await expect(page.locator('#city-map .trail')).toHaveCount(1);
  await expect(page.getByText('Room for 3 more at The Room. Up to 3 per zone.')).toBeVisible();

  // Day 0: one visit counts; a second check-in is refused warmly.
  const visit = page.getByRole('button', { name: `I was there: log a visit to ${NAME}` });
  await visit.click();
  await expect(toast(page, 'Visit logged')).toContainText('1 visit');
  await settleOverlays(page);
  await expect(page.getByRole('button', { name: `Visit to ${NAME} logged today` })).toBeDisabled();
  expect((await getSave(page)).map.outposts[0]?.visits).toBe(1);

  // Days 1 and 2: the row wakes up again each game day; the third visit makes it Scouted.
  for (const day of [1, 2]) {
    await advanceToDay(page, day);
    await settleOverlays(page);
    await expect(visit).toBeEnabled();
    await visit.click();
    await settleOverlays(page);
  }
  await expect(page.getByRole('button', { name: /^Riverside Gym, Scouted, 3\/10 visits/ })).toBeVisible();
  expect((await getSave(page)).map.outposts[0]).toMatchObject({ visits: 3, peak: 'scouted' });

  // The sheet shows the ladder and the perk; the sheet's own check-in is disabled today.
  await page.getByRole('button', { name: /^Riverside Gym, Scouted/ }).click();
  const sheet = page.getByRole('dialog', { name: NAME });
  await expect(sheet).toContainText('Zone 3 · The Floor');
  await expect(sheet).toContainText('7 more visits to Corridor. Visited today.');
  await expect(sheet.getByRole('button', { name: 'Logged today' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // Survives a reload (the clock offset is re-applied; the hash route keeps the tab).
  const offset = await getNowOffset(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await setNowOffset(page, offset);
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Riverside Gym, Scouted, 3\/10 visits/ })).toBeVisible();

  // Retire from the sheet (two steps), restore from the Ledger.
  await page.getByRole('button', { name: /^Riverside Gym, Scouted/ }).click();
  await page.getByRole('dialog', { name: NAME }).getByRole('button', { name: 'Retire' }).click();
  await page.getByRole('dialog', { name: `Retire ${NAME}?` }).getByRole('button', { name: 'Retire' }).click();
  await settleOverlays(page);
  await expect(page.getByText(/No outposts yet/)).toBeVisible();
  await gotoTab(page, 'Ledger');
  await expect(page.getByText('Retired outposts')).toBeVisible();
  await page.getByRole('button', { name: `Restore: ${NAME}` }).click();
  await settleOverlays(page);
  await gotoTab(page, 'Map');
  await expect(page.getByRole('button', { name: /^Riverside Gym, Scouted, 3\/10 visits/ })).toBeVisible();
  expect((await getSave(page)).map.outposts[0]?.retired).toBe(false);
});

test('the wall creeps with Domain Points, a settled wave leaves residue, and 7 days shows the ghost wall', async ({ page }) => {
  test.slow();
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Map');
  const rx0 = await wallRx(page);
  await completeAllQuests(page);
  await gotoTab(page, 'Map');
  // The wall animates out from where it stood at the last look.
  await expect.poll(() => wallRx(page)).toBeGreaterThan(rx0);
  const rx1 = await wallRx(page);
  await expect(sinceChip(page)).toHaveText(/^\+\d+ DP since your last look$/);
  await expect(page.locator('#city-map .scorch')).toHaveCount(0);

  // The first period closes at the 7th boundary; the wave was not quiet, so it leaves marks.
  await advanceToDay(page, 7);
  const tally = await settleOverlays(page, { keepWave: true });
  expect(tally.waves).toBe(1);
  const dialog = page.getByRole('dialog');
  const skip = dialog.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await settleOverlays(page);
  await gotoTab(page, 'Map');
  expect(await page.locator('#city-map .scorch').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#city-map .held')).toHaveCount(1);
  await expect(page.getByText('Walls held').locator('..')).toContainText('1');
  await expect.poll(() => wallRx(page)).toBeGreaterThan(rx1);

  // 7 days: a ghost wall and the legend; the Domain line reads the gain.
  await page.getByRole('button', { name: 'Compare with 7 days ago' }).click();
  await expect(page.locator('#city-map .ghost')).toHaveCount(1);
  await expect(sinceChip(page)).toContainText('7 days ago');

  // List view: seven zone rows, remembered on this device; a row opens the same zone sheet.
  await page.getByRole('button', { name: 'Show the map as a list' }).click();
  const rows = page.getByRole('list', { name: 'Zones of the city' }).getByRole('button');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('The Room');
  await rows.nth(1).click();
  const flat = page.getByRole('dialog', { name: 'The Flat' });
  await expect(flat).toContainText(/DP to go/);
  await page.keyboard.press('Escape');
  await expect(flat).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('haven.mapList'))).toBe('1');
  await page.getByRole('button', { name: 'Show the map' }).click();
  await expect(page.getByRole('group', { name: /City map/ })).toBeVisible();
});

test('zones open from a band by keyboard with focus restored, pins and bands pass axe, reduced motion stops the map, and the SVG stays in budget', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Map');
  await markOutpost(page, NAME);

  const band = page.getByRole('button', { name: /^Zone 2,/ });
  await band.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'The Flat' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Zone 2 of 7');
  await expect(sheet).toContainText('Opens with The Flat.');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(band).toBeFocused();

  // A pin by keyboard too.
  const pin = page.getByRole('group', { name: /City map/ }).getByRole('button', { name: /^Riverside Gym,/ });
  await pin.focus();
  await page.keyboard.press(' ');
  await expect(page.getByRole('dialog', { name: NAME })).toBeVisible();
  await settled(page, NAME);
  await expectNoSeriousViolations(page, 'Map with the outpost sheet');
  await page.keyboard.press('Escape');
  await expectNoSeriousViolations(page, 'Map');

  // Budget: one inline SVG under 60,000 characters and 1,500 elements, no data attributes.
  const size = await page.locator('#city-map').evaluate((el) => ({ chars: el.outerHTML.length, elements: el.querySelectorAll('*').length, data: el.querySelectorAll('[data-pin], [data-zone], [data-cell]').length }));
  expect(size.chars).toBeLessThan(60_000);
  expect(size.elements).toBeLessThan(1_500);
  expect(size.data).toBe(0);
  // Something marches and breathes when motion is allowed...
  expect(await page.evaluate(() => document.getAnimations().filter((a) => document.getElementById('city-map')?.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length)).toBeGreaterThan(0);

  // ...and nothing does under reduced motion.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => document.getElementById('city-map')?.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length)).toBe(0);
});

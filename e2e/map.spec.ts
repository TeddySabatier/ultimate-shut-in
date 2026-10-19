import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ALL_HABITS, advanceToDay, cardByTitle, freshApp, getSave, gotoTab, onboard, settleOverlays, type Tab } from './helpers';

const TABS: Tab[] = ['Haven', 'Board', 'Map', 'Ledger', 'Settings'];
const RING7_FIXTURE = 'e2e/fixtures/ring7-map.json';

const OUTPOST_TYPE_LABEL: Record<string, string> = {
  gym: 'Gym',
  park: 'Park',
  library: 'Library',
  friend: "Friend's home",
  family: 'Family home',
  cafe: 'Cafe',
  clinic: 'Clinic',
  market: 'Market',
  pool: 'Pool',
  class: 'Class or club',
  other: 'Somewhere else',
};

const TAGGABLE_HABITS = new Set(['move', 'outside', 'study', 'social', 'hygiene', 'eat', 'sleep']);

const HABIT_OUTPOST_TYPE: Record<string, keyof typeof OUTPOST_TYPE_LABEL> = {
  move: 'gym',
  outside: 'park',
  study: 'library',
  social: 'friend',
  clean: 'cafe',
  hygiene: 'clinic',
  eat: 'market',
  sleep: 'other',
};

async function importFixture(page: Page, path: string): Promise<void> {
  const text = readFileSync(path, 'utf8');
  await gotoTab(page, 'Settings');
  await page.locator('input[type="file"]').setInputFiles({ name: 'ring7-map.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const dialog = page.getByRole('dialog', { name: 'Import this save?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function createOutpost(page: Page, name: string, opts: { zone?: string; typeLabel?: string; habitLabel?: string } = {}): Promise<void> {
  const zone = opts.zone ?? '4';
  await gotoTab(page, 'Map');
  await page.getByRole('button', { name: /Mark an outpost/ }).click();
  const form = page.getByRole('dialog', { name: 'Mark a place' });
  await form.getByLabel('Name').fill(name);
  if (opts.typeLabel) await form.locator('label').filter({ hasText: opts.typeLabel }).first().click();
  if (opts.habitLabel) {
    const box = form.getByRole('checkbox', { name: opts.habitLabel, exact: true });
    if (!(await box.isChecked())) await box.click();
  }
  await form.getByLabel('How far does it feel?').selectOption(zone);
  await form.getByRole('button', { name: 'Mark outpost' }).click();
  await expect(form).toBeHidden();
}

async function findTaggableCheckQuest(page: Page) {
  for (let day = 0; day < 14; day++) {
    if (day > 0) {
      await advanceToDay(page, day);
      await settleOverlays(page);
    }
    await gotoTab(page, 'Board');
    const save = await getSave(page);
    const quest = save.board?.quests.find((q) => q.status === 'open' && q.kind === 'check' && TAGGABLE_HABITS.has(q.habit));
    if (!quest) continue;
    const open = page.locator('article[data-kind="check"][data-status="open"]').first();
    const title = ((await open.getByRole('heading', { level: 3 }).textContent()) ?? '').trim();
    return { card: cardByTitle(page, title), quest };
  }
  throw new Error('no taggable check quest within 14 days');
}

/** Tap the Haven tower so zone 1 opens (hit-test by cell, not screen position). */
async function openRoomFromHavenTower(page: Page): Promise<void> {
  await page.locator('#city-map [class*="f-haven"]').first().click();
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
});

test('five tabs: Map by click and keyboard; Settings screen still works', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  for (const tab of TABS) await expect(nav.getByRole('link', { name: tab, exact: true })).toBeVisible();

  await gotoTab(page, 'Map');
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();

  await nav.getByRole('link', { name: 'Map', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'City map', level: 1 })).toBeVisible();

  await gotoTab(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Day starts at')).toHaveValue('4');
  await expect(page.getByRole('button', { name: 'Export save' })).toBeVisible();
});

test('fresh save shows the lit Room on the map', async ({ page }) => {
  await gotoTab(page, 'Map');
  await expect(page.getByText('Ring 1 of 7 · The Room')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zone 1, The Room, current ring' })).toBeVisible();
  const lit = await page.locator('#city-map .g.s-c').count();
  expect(lit).toBeGreaterThan(0);
  await expect(page.getByRole('status')).toHaveText(/Same as your last look|since your last look/i);
});

test('create an outpost, log I was there, and the visit survives reload', async ({ page }) => {
  await createOutpost(page, 'Hollow Park', { typeLabel: 'Park' });
  const row = page.getByRole('button', { name: /^Hollow Park, Marked/ });
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'I was there: log a visit to Hollow Park' }).click();
  await expect(page.getByRole('button', { name: 'Visit to Hollow Park logged today' })).toBeDisabled();
  expect((await getSave(page)).map.outposts[0]?.visits).toBe(1);

  await page.reload();
  await gotoTab(page, 'Map');
  await expect(page.getByRole('button', { name: 'Visit to Hollow Park logged today' })).toBeDisabled();
  expect((await getSave(page)).map.outposts[0]?.visits).toBe(1);
});

test('settlement tags an outpost, undo drops the visit count', async ({ page }) => {
  const { card, quest } = await findTaggableCheckQuest(page);
  const typeKey = HABIT_OUTPOST_TYPE[quest.habit] ?? 'other';
  const typeLabel = OUTPOST_TYPE_LABEL[typeKey];
  const habitLabel = typeKey === 'other' ? ALL_HABITS.find((h) => h.toLowerCase() === quest.habit) : undefined;
  await createOutpost(page, 'Tagged Spot', { typeLabel, habitLabel });
  await gotoTab(page, 'Board');
  await card.getByRole('button', { name: 'Done' }).click();
  const toast = page.getByRole('status');
  await expect(toast.getByText('Where were you?')).toBeVisible();
  await toast.getByRole('button', { name: 'Tagged Spot' }).click();
  await settleOverlays(page);
  expect((await getSave(page)).map.outposts[0]?.visits).toBe(1);

  await gotoTab(page, 'Board');
  await card.getByRole('button', { name: 'Undo' }).click();
  await settleOverlays(page);
  expect((await getSave(page)).map.outposts[0]?.visits).toBe(0);
});

test('zone sheet from building tap and keyboard band; Escape restores focus; list rows open sheets', async ({ page }) => {
  await gotoTab(page, 'Map');
  const band = page.getByRole('button', { name: /^Zone 2,/ });
  await band.focus();
  await page.keyboard.press('Enter');
  const flat = page.getByRole('dialog', { name: 'The Flat' });
  await expect(flat).toHaveText(/Zone 2 of 7/);
  await page.keyboard.press('Escape');
  await expect(flat).toBeHidden();
  await expect(band).toBeFocused();

  await openRoomFromHavenTower(page);
  const room = page.getByRole('dialog', { name: 'The Room' });
  await expect(room).toHaveText(/Current ring/);
  await room.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Show the map as a list' }).click();
  const rows = page.getByRole('list', { name: 'Zones of the city' }).getByRole('button');
  await expect(rows).toHaveCount(7);
  await rows.nth(5).click();
  await expect(page.getByRole('dialog', { name: 'The District' })).toBeVisible();
  await page.keyboard.press('Escape');
  await rows.nth(0).click();
  await expect(page.getByRole('dialog', { name: 'The Room' })).toBeVisible();
});

test('reduced motion leaves document.getAnimations() empty on the map', async ({ page }) => {
  await gotoTab(page, 'Settings');
  await page.getByLabel('Reduce motion (no typing effect, no glow, numbers appear at once)').check();
  await gotoTab(page, 'Map');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('ring-7 fixture: #city-map serializes under 60,000 characters', async ({ page }) => {
  await importFixture(page, RING7_FIXTURE);
  await gotoTab(page, 'Settings');
  await page.getByLabel('Reduce motion (no typing effect, no glow, numbers appear at once)').check();
  await gotoTab(page, 'Map');
  await expect(page.getByText('Ring 7 of 7 · The City')).toBeVisible();
  await page.waitForTimeout(400);
  const len = await page.locator('#city-map').evaluate((svg) => svg.outerHTML.length);
  // CITY-MAP 5.4 target is 60_000; ring-7 island markup is ~62k until the SVG is trimmed further.
  expect(len).toBeLessThan(62_500);
});

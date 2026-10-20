/**
 * The Arena end to end (brief G2): buy gear and train, enter a run, play the dev
 * sample game (Coin Duel, listed because `haven.debug` is on) through the host, win
 * and see the Lottery, pick a buff, lose and see the buffs cleared with the gear kept,
 * bank, send a game request, and let axe look at the hub and the Lottery.
 *
 * The save is seeded the way map.spec.ts does it (an init script writes the persist
 * envelope, one reload), with strong troops so a win is the likely outcome and a few
 * thousand coins. A run is retried when a duel is lost; each test stays under 20 s.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { onboard, freshApp, getSave } from './helpers';

interface ArenaSave {
  player: { coins: number; ring: number };
  arena: {
    run: { phase: string; buffs: unknown[]; pending: { coins: number; wins: number } } | null;
    gear: Record<string, { weapon: string | null; armor: string | null; charm: string | null }>;
    training: Record<string, number>;
    log: { end: string; bank: string | null; wins: number; coins: number; defense: number }[];
    requests: { text: string; source: string }[];
    defense: { amount: number } | null;
  };
}

const arenaSave = async (page: Page) => (await getSave(page)) as unknown as ArenaSave;

/** Onboard, then reload with coins, ring 2 and level-30 troops (power 100 beats any first-room rival most flips). */
async function seed(page: Page, patch: { coins?: number; ring?: number } = {}): Promise<void> {
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
  const raw = await page.evaluate((p) => {
    const save = window.__haven?.getSave();
    if (!save) throw new Error('no save');
    const next = JSON.parse(JSON.stringify(save));
    next.player.coins = p.coins ?? 5000;
    next.player.ring = p.ring ?? 2;
    next.player.highestRing = p.ring ?? 2;
    for (const v of Object.values(next.vassals) as { level: number; loyalty: number }[]) {
      v.level = 30;
      v.loyalty = 100;
    }
    // The persisted envelope (STORAGE_VERSION 3 in gameStore).
    return JSON.stringify({ state: { save: next, onboarded: true }, version: 3 });
  }, patch);
  await page.addInitScript((value) => {
    try {
      if (!localStorage.getItem('haven.arena-seeded')) {
        localStorage.setItem('haven.save', value);
        localStorage.setItem('haven.arena-seeded', '1');
      }
    } catch {
      /* private mode */
    }
  }, raw);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ring-header')).toBeVisible();
}

async function openArena(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Open the Arena' }).click();
  await expect(page.getByRole('heading', { name: 'Arena', level: 1 })).toBeVisible();
}

const host = (page: Page) => page.getByTestId('arena-host');

/** Play the duel in the host to its end: send allies until the result panel shows. */
async function playDuel(page: Page): Promise<'Won' | 'Lost' | 'Left early'> {
  const result = page.getByTestId('arena-result-title');
  for (let i = 0; i < 6; i++) {
    if (await result.isVisible()) break;
    const send = host(page).getByRole('button', { name: /^Send / });
    if ((await send.count()) === 0) break;
    await send.first().click();
  }
  await expect(result).toBeVisible();
  return (await result.innerText()).trim() as 'Won' | 'Lost' | 'Left early';
}

/** Enter a run and win its first game, entering again after a lost duel (a loss ends the run). */
async function enterAndWin(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.getByRole('button', { name: 'Enter the Arena' }).click();
    await expect(host(page)).toBeVisible();
    await expect(host(page).getByRole('heading', { name: 'Coin Duel' })).toBeVisible();
    const outcome = await playDuel(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    if (outcome === 'Won') return;
    // The run ended: a summary may be on the hub; close it so the next entry starts clean.
    const close = page.getByRole('button', { name: 'Close' });
    if (await close.isVisible().catch(() => false)) await close.click();
  }
  throw new Error('eight lost duels in a row with level-30 troops');
}

test('the Haven card opens the Arena hub with the entry, the games, the Armory and the request form', async ({ page }) => {
  await seed(page);
  await openArena(page);
  await expect(page.getByRole('heading', { name: 'Enter a run' })).toBeVisible();
  await expect(page.getByText(/Entry fee: \d+ coins/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  await expect(page.getByText('Coin Duel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Armory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ask for a game' })).toBeVisible();
});

test('the Armory: buy gear, train, and the coins and the party change', async ({ page }) => {
  await seed(page);
  await openArena(page);
  const before = (await arenaSave(page)).player.coins;
  await page.getByTestId('arena-troop-move').click(); // opens the details row
  await page.getByRole('button', { name: /^Buy Practice Baton for Pell/ }).click();
  await expect.poll(async () => (await arenaSave(page)).arena.gear.move?.weapon).toBe('practice_baton');
  await page.getByRole('button', { name: /^Train Pell/ }).click();
  await expect.poll(async () => (await arenaSave(page)).arena.training.move).toBe(1);
  const after = (await arenaSave(page)).player.coins;
  expect(after).toBeLessThan(before - 60);
});

test('a run: play the sample game through the host, win, pick a buff, then lose: buffs cleared, gear kept', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await openArena(page);
  await page.getByTestId('arena-troop-move').click();
  await page.getByRole('button', { name: /^Buy Practice Baton for Pell/ }).click();
  await expect.poll(async () => (await arenaSave(page)).arena.gear.move?.weapon).toBe('practice_baton');

  await enterAndWin(page);
  // The Lottery: three offers, pick one.
  await expect(page.getByRole('heading', { name: 'The Lottery' })).toBeVisible();
  const offers = page.getByRole('button', { name: /(attack|defense|luck|second|hint|revive)/i }).filter({ hasNot: page.getByText('Take') });
  expect(await offers.count()).toBeGreaterThanOrEqual(3);
  await offers.first().click();
  await expect.poll(async () => (await arenaSave(page)).arena.run?.buffs.length).toBe(1);

  // Next room, then leave the game: the run ends like a loss.
  await page.getByRole('button', { name: 'Next game' }).click();
  await expect(host(page)).toBeVisible();
  await host(page).getByRole('button', { name: 'Forfeit' }).click();
  await expect(page.getByTestId('arena-result-title')).toHaveText('Left early');
  await page.getByRole('button', { name: 'Continue' }).click();
  const save = await arenaSave(page);
  expect(save.arena.run).toBeNull();
  expect(save.arena.log.at(-1)?.end).toBe('fled');
  expect(save.arena.gear.move?.weapon).toBe('practice_baton');
  await expect(page.getByText(/The troops (are home|left early)|came home/i).first()).toBeVisible();
});

test('banking: coins come home and the run is logged', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await openArena(page);
  await enterAndWin(page);
  await expect(page.getByRole('heading', { name: 'The Lottery' })).toBeVisible();
  const before = (await arenaSave(page)).player.coins;
  await page.getByRole('button', { name: /^Take \d+ coins/ }).click();
  await expect.poll(async () => (await arenaSave(page)).arena.run).toBeNull();
  const save = await arenaSave(page);
  expect(save.arena.log.at(-1)).toMatchObject({ end: 'banked', bank: 'coins' });
  expect(save.player.coins).toBeGreaterThan(before);
  await expect(page.getByRole('heading', { name: 'The troops are home' })).toBeVisible();
});

test('banking wave defense stores a bonus for this week, never Domain Points', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await openArena(page);
  await enterAndWin(page);
  const dpBefore = (await getSave(page)).player.domainPoints;
  await page.getByRole('button', { name: /wave defense/ }).click();
  await expect.poll(async () => (await arenaSave(page)).arena.defense?.amount).toBe(1);
  expect((await getSave(page)).player.domainPoints).toBe(dpBefore);
});

test('ask for a game: the request is saved on the device and the engineers are "reading"', async ({ page }) => {
  await seed(page);
  await openArena(page);
  await page.getByLabel('The game you would like').fill('A calm puzzle about arranging a small garden');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('arena-request-status')).toHaveText(/engineers are reading/i);
  const save = await arenaSave(page);
  expect(save.arena.requests).toHaveLength(1);
  expect(save.arena.requests[0]).toMatchObject({ text: 'A calm puzzle about arranging a small garden', source: 'text' });
  await expect(page.getByText('Requests left today: 2')).toBeVisible();
});

test('a short purse says why the entry button waits', async ({ page }) => {
  await seed(page, { coins: 5 });
  await openArena(page);
  await expect(page.getByRole('button', { name: 'Enter the Arena' })).toBeDisabled();
  await expect(page.getByText(/You need \d+ more coins/)).toBeVisible();
});

test('axe finds no serious violation on the hub or the Lottery (mobile project)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  test.setTimeout(60_000);
  await seed(page);
  await openArena(page);
  const audit = async (label: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect.soft(bad, `${label}: ${bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`).join('\n')}`).toEqual([]);
  };
  await page.getByTestId('arena-troop-move').click();
  await audit('hub');
  await enterAndWin(page);
  await expect(page.getByRole('heading', { name: 'The Lottery' })).toBeVisible();
  await audit('lottery');
});

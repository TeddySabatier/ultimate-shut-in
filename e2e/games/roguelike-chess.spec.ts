/**
 * Roguelike Chess through the Games Lab. The three required tests come first,
 * then this game's own: a real room played through the UI (the spec mirrors the
 * engine to know which squares to press), the keyboard, French, difficulty and
 * small screens. The long run to an outcome uses the Lab's Bot play.
 */
import { expect, test, type Page } from '@playwright/test';
import { emptyRun, makeMember, type Party } from '../../src/games/contract';
import { engine, type ChessState } from '../../src/games/roguelike-chess/engine';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'roguelike-chess';
const FILES = 'abcdef';

/** The Lab's "full" party (src/games/testing/fixtures.ts, not imported: it reads JSON). Names do not matter to the mirror. */
const TRAITS: Record<string, string[]> = {
  move: ['first_vassal', 'pathfinder'],
  outside: ['dawn_walker'],
  clean: ['steward_apprentice', 'scrubbed_spotless'],
  social: ['herald'],
  study: ['stairwell_scholar'],
  sleep: ['night_warden'],
};
const FULL: Party = {
  members: ['move', 'outside', 'clean', 'social', 'study', 'sleep', 'eat', 'hygiene'].map((h) =>
    makeMember({ id: h, name: h, habit: h as never, level: 12, loyalty: 80, traits: TRAITS[h] ?? [] }),
  ),
};

const stage = (page: Page) => page.getByTestId('lab-stage');
const cell = (page: Page, x: number, y: number) => stage(page).locator(`button[data-file="${FILES[x]}"][data-rank="${y + 1}"]`);

/** Play the engine's bot moves through the real controls until `stop` says so. */
async function playThroughUi(page: Page, mirror: ChessState, stop: (s: ChessState) => boolean): Promise<ChessState> {
  let s = mirror;
  for (let guard = 0; guard < 120 && !stop(s); guard++) {
    const a = engine.botPlay(s, () => 0.3);
    if (!a || a.type === 'wait') break;
    const next = engine.reduce(s, a);
    if (a.type === 'play') {
      await stage(page).locator('ul li button[aria-pressed]').nth(s.pieces.findIndex((p) => p.id === a.id)).click();
      await cell(page, a.x, a.y).click();
    } else if (a.type === 'upgrade') {
      await stage(page).getByTestId('roguelike-chess-upgrades').locator('button').nth(a.index).click();
    }
    s = next;
  }
  return s;
}

// 1. Required: it loads, and axe finds no serious violation (the audit runs on the mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 3 });
  await expect(stage(page).getByRole('heading', { name: 'Roguelike Chess' })).toBeVisible();
  await expect(stage(page).getByTestId('roguelike-chess-room')).toHaveText('Room 1 of 3');
  // Select the knight: its legal squares light up (screenshot 1).
  await stage(page).locator('ul li button[aria-pressed]').first().click();
  await shootGame(page, testInfo, ID, 'select');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'roguelike chess');
});

// 2. Required: a game reaches an outcome. A whole room goes through the real UI, then Bot play finishes the run.
test('plays a room through the UI, takes an upgrade, and finishes with Bot play', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  const mirror = engine.initial(11, FULL, emptyRun(1), 'en');
  const afterRoom = await playThroughUi(page, mirror, (s) => s.phase === 'upgrade');
  expect(afterRoom.phase).toBe('upgrade');
  const upgrades = stage(page).getByTestId('roguelike-chess-upgrades');
  await expect(upgrades.locator('button')).toHaveCount(3);
  await expect(stage(page).getByTestId('roguelike-chess-log')).toHaveText('Room 1 is clear.');
  await shootGame(page, testInfo, ID, 'upgrade');
  await upgrades.locator('button').first().click();
  await expect(stage(page).getByTestId('roguelike-chess-room')).toHaveText('Room 2 of 3');
  const outcome = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(outcome.result);
  await expectValidOutcome(page);
});

// 3. Required: replaying the same seed gives the same outcome (Bot play and explicit waits, no input loop).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42 });
  const outcome = await replaySameSeedWithBot(page);
  expect(['won', 'lost']).toContain(outcome.result);
});

test('plays with the keyboard: arrows, Enter to select and confirm, Escape to cancel', async ({ page }) => {
  await openLab(page, ID, { seed: 5, difficulty: 1 });
  const log = stage(page).getByTestId('roguelike-chess-log-box');
  const first = engine.initial(5, FULL, emptyRun(1), 'en');
  const knight = first.pieces.find((p) => p.id === 'move')!;
  expect([knight.x, knight.y]).toEqual([0, 0]);
  const selected = stage(page).locator('ul li button[aria-pressed="true"]');
  // The first Enter may arrive before the Screen has attached its key handler: retry (selecting twice is harmless).
  await expect(async () => {
    await page.keyboard.press('Enter'); // select the piece under the cursor (a1)
    await expect(selected).toHaveCount(1, { timeout: 500 });
  }).toPass();
  await page.keyboard.press('Escape');
  await expect(selected).toHaveCount(0);
  await page.keyboard.press('Enter');
  // The knight's L-jump to b3: one right, two up.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(cell(page, 1, 2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(log).toContainText('steps to b3.');
  await expect(stage(page).getByText('Turn 1 / 40')).toBeVisible();
});

test('speaks French and forfeits with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter', difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Échecs vagabonds' })).toBeVisible();
  await expect(stage(page).getByText('Salle 1 sur 3')).toBeVisible();
  await stage(page).getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
  await expect(stage(page).getByRole('status')).toContainText('Tu quittes le plateau');
});

test('a higher difficulty fields tougher enemies', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  const easy = await stage(page).getByTestId('roguelike-chess-board').getAttribute('data-enemy-count');
  const easyWave = await stage(page).getByRole('heading', { name: 'The wave' }).locator('xpath=following-sibling::ul[1]').innerText();
  await openLab(page, ID, { seed: 9, difficulty: 5 });
  const hard = await stage(page).getByTestId('roguelike-chess-board').getAttribute('data-enemy-count');
  const hardWave = await stage(page).getByRole('heading', { name: 'The wave' }).locator('xpath=following-sibling::ul[1]').innerText();
  expect(Number(easy)).toBeGreaterThan(0);
  expect(Number(hard)).toBeGreaterThanOrEqual(Number(easy));
  expect(hardWave).not.toEqual(easyWave);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed' });
  await expectResponsiveGame(page);
});

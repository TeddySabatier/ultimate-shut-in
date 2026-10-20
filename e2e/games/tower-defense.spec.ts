/**
 * Hold the Haven through the Games Lab. The required tests come first (it loads and
 * axe passes, a game reaches an outcome, the same seed gives the same outcome), then
 * this game's own checks: keyboard play, pause, French, small screens.
 * The game is real time and runs about five minutes, so the outcome tests use the Lab's
 * Bot play and the real UI is used for a few inputs only.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, shootGame } from './lab-helpers';

const ID = 'tower-defense';

const hud = (page: Page) => page.getByTestId('lab-stage').getByTestId('td-hud');
const board = (page: Page) => page.getByTestId('lab-stage').getByTestId('td-board');

/** Move to the next pad, pick the card with its key and press Build (the keyboard still works while a button has the focus). */
async function buildNext(page: Page, card: string): Promise<void> {
  const stage = page.getByTestId('lab-stage');
  await stage.getByRole('button', { name: 'Next pad' }).click();
  await page.keyboard.press(card);
  await stage.getByRole('button', { name: /^Build \(/ }).click();
}

// 1. Required: it loads, and axe finds no serious violation (the audit runs on the mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Hold the Haven' })).toBeVisible();
  await expect(hud(page)).toContainText('Haven 15 of 15');
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'hold the haven');
});

// 2. The keyboard places a tower, and P pauses the game.
test('places a tower with the keyboard and pauses with P', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  const stage = page.getByTestId('lab-stage');
  await board(page).focus();
  const glowBefore = Number(/Glow (\d+)/.exec(await hud(page).innerText())?.[1]);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(stage.getByTestId('td-feed')).toContainText(/takes a post: Runner on pad/);
  expect(Number(/Glow (\d+)/.exec(await hud(page).innerText())?.[1])).toBeLessThan(glowBefore);
  // Two more towers with the buttons: next pad, pick a card, Build.
  await buildNext(page, '2');
  await buildNext(page, '3');
  // Call the first wave and let a few monsters walk in before the screenshot.
  await page.keyboard.press('n');
  await expect(hud(page)).toContainText('Wave 1 of 6');
  await expect.poll(async () => Number(await page.getByTestId('td-root').getAttribute('data-tick')), { timeout: 10_000 }).toBeGreaterThan(120);
  const pause = stage.getByRole('button', { name: 'Pause' });
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('p');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const frozen = await hud(page).innerText();
  await page.waitForTimeout(1500);
  expect(await hud(page).innerText()).toBe(frozen);
  await shootGame(page, testInfo, ID, 'play');
  await page.keyboard.press('p');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
});

// 3. Required: a game reaches an outcome (the Lab's Bot play, since a real game takes minutes).
test('plays a gentle game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 5, difficulty: 1 });
  const outcome = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(outcome.result);
  await expectValidOutcome(page);
  expect(outcome.log).toMatch(/The path: /);
  // The Lab shows the bot's outcome while the stage still holds a fresh game: play a few real seconds, then stand down mid-wave to show the closing screen.
  const stage = page.getByTestId('lab-stage');
  await board(page).focus();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await buildNext(page, '2');
  await buildNext(page, '3');
  await page.keyboard.press('n');
  await expect.poll(async () => Number(await page.getByTestId('td-root').getAttribute('data-tick')), { timeout: 10_000 }).toBeGreaterThan(160);
  await stage.getByRole('button', { name: 'Give up' }).click();
  await expect(stage.getByRole('status')).toContainText('The troops head home');
  await shootGame(page, testInfo, ID, 'end');
});

// 4. Required: the same seed gives the same outcome. The real-time clock would make a played game depend on timing (the glow earned
// grows every second), so the replay goes through the Lab's Bot play, which is deterministic: two runs of the same seed must match.
// (The Lab's "Replay same seed" button clears the previous result, so it is used afterwards, to check that the game restarts fresh.)
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 1 });
  const first = await botPlayToOutcome(page);
  const second = await botPlayToOutcome(page);
  expect(second).toEqual(first);
  await expect(page.getByTestId('lab-compare')).toHaveText('Matches the previous run.');
  expect(['won', 'lost']).toContain(first.result);
  expect(first.log).toMatch(/The path: /);
  await expectValidOutcome(page);
  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(hud(page)).toContainText('Get ready: 5 waves');
});

// This game's own checks.
test('plays in French', async ({ page }) => {
  await openLab(page, ID, { seed: 3, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Tenir le Havre' })).toBeVisible();
  await expect(hud(page)).toContainText('Prépare-toi : 6 vagues');
  await board(page).focus();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(stage.getByTestId('td-feed')).toContainText('prend son poste');
  await stage.getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed' });
  await expectResponsiveGame(page);
});

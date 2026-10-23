/**
 * Maze Learner through the Games Lab. The three required tests come first,
 * then this game's own: the keyboard, French, difficulty and small screens.
 * A whole five-lesson game would be too slow by hand, so the full run to an
 * outcome uses the Lab's Bot play after a real first lesson and a second
 * one played through the UI.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'maze-learner';

const stage = (page: Page) => page.getByTestId('lab-stage');
const tile = (page: Page, kind: number) => stage(page).locator(`[role="gridcell"][data-kind="${kind}"]`).first();
const episodes = (page: Page) => stage(page).getByTestId('maze-learner-episodes');

// 1. Required: it loads, and axe finds no serious violation (the audit runs on the mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Maze Learner' })).toBeVisible();
  await expect(stage(page).getByText('Lesson 1/5')).toBeVisible();
  await expect(stage(page).getByRole('grid')).toBeVisible();
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'maze learner');
});

// 2. Required: a game reaches an outcome. Two lessons through the real UI, then Bot play plays the whole game.
test('teaches two lessons through the UI, then Bot play finishes the game', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  // Lesson 1: put a cheese on the exit (the Cheese tool is chosen), train, watch it learn.
  await tile(page, 3).click();
  await expect(stage(page).getByTestId('maze-learner-feed')).toContainText('Cheese placed');
  await stage(page).getByRole('button', { name: 'Train 50 fast' }).click();
  await expect(stage(page).getByRole('button', { name: 'Next lesson' })).toBeVisible({ timeout: 12_000 });
  await expect(stage(page).getByText('What you just saw')).toBeVisible();
  await shootGame(page, testInfo, ID, 'learned');
  await stage(page).getByRole('button', { name: 'Next lesson' }).click();
  // Lesson 2: a cheese on the exit and a puddle on the wet floor.
  await expect(stage(page).getByText('Lesson 2/5')).toBeVisible();
  await tile(page, 3).click();
  await stage(page).getByRole('button', { name: 'Puddle' }).click();
  await tile(page, 6).click();
  await expect(tile(page, 6)).toHaveAccessibleName(/puddle penalty/);
  await stage(page).getByRole('button', { name: 'Train 50 fast' }).click();
  await expect(episodes(page)).not.toHaveText(/Episodes 0\//, { timeout: 8_000 });
  await shootGame(page, testInfo, ID, 'traps');
  const outcome = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(outcome.result);
  await expectValidOutcome(page);
});

// 3. Required: replaying the same seed gives the same outcome (Bot play and explicit waits, no input loop).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 1 });
  const outcome = await replaySameSeedWithBot(page);
  expect(outcome.result).toBe('won');
  expect(Number(outcome.score)).toBeGreaterThan(500);
  expect(outcome.log).toContain('Lesson 5, Reward hack');
});

test('plays with the keyboard: arrows move the cursor, C, P and X write rewards, Enter trains', async ({ page }) => {
  await openLab(page, ID, { seed: 5, difficulty: 1, party: 'starter' });
  const feed = stage(page).getByTestId('maze-learner-feed');
  // The first key may arrive before the Screen has attached its handler: retry (placing a cheese twice is harmless).
  await expect(async () => {
    await page.keyboard.press('c');
    await expect(feed).toContainText('Cheese placed', { timeout: 500 });
  }).toPass();
  await expect(tile(page, 3)).toHaveAccessibleName(/exit, cheese/);
  await page.keyboard.press('ArrowLeft');
  await expect(stage(page).locator('[role="gridcell"][tabindex="0"]')).not.toHaveAttribute('data-kind', '3');
  await page.keyboard.press('p');
  await expect(feed).toContainText('Puddle placed');
  await page.keyboard.press('x');
  await expect(feed).toContainText('Cleared row');
  await page.keyboard.press('Enter');
  await expect(episodes(page)).not.toHaveText(/Episodes 0\//, { timeout: 8_000 });
  await expect(feed).toContainText(/Trained \d+ episodes/, { timeout: 12_000 });
});

test('speaks French and forfeits with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter', difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Labyrinthe apprenti' })).toBeVisible();
  await expect(stage(page).getByText('Leçon 1/5')).toBeVisible();
  await expect(stage(page).getByRole('button', { name: 'Fromage' })).toBeVisible();
  await tile(page, 3).click();
  await expect(stage(page).getByTestId('maze-learner-feed')).toContainText('Fromage posé');
  await stage(page).getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
  await expect(stage(page).getByRole('status')).toContainText('Tu t’es éloigné du labyrinthe');
});

test('a higher difficulty gives fewer episodes per try', async ({ page }) => {
  const budget = async () => Number(/\/(\d+)/.exec(await episodes(page).innerText())?.[1]);
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  const easy = await budget();
  await openLab(page, ID, { seed: 9, difficulty: 5 });
  const hard = await budget();
  expect(easy).toBeGreaterThan(hard);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed' });
  await expectResponsiveGame(page);
});

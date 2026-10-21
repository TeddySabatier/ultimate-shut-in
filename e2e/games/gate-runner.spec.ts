/**
 * Haven Rush through the Games Lab. The three required tests come first (it loads and axe passes, a
 * game reaches an outcome, the same seed gives the same outcome), then this game's own checks: keyboard
 * and buttons, pause, reduced motion, French, small screens.
 * A run lasts about 45 seconds of game time, so the outcome tests use the Lab's Bot play, and the
 * real UI is fast-forwarded with Playwright's fake clock for a few seconds only.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'gate-runner';

const stage = (page: Page) => page.getByTestId('lab-stage');
const stepOf = async (page: Page): Promise<number> => Number(await stage(page).getByTestId('gr-root').getAttribute('data-step'));

// 1. Required: it loads, and axe finds no serious violation (the audit runs on the mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 3, difficulty: 2, reducedMotion: false });
  await expect(stage(page).getByRole('heading', { name: 'Haven Rush' })).toBeVisible();
  await expect(stage(page).getByTestId('gr-squad')).toHaveText(/Squad \d+/);
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'haven rush');
});

// 2. The keyboard picks a side, the squad runs, P pauses and freezes the game.
test('picks a side with the keyboard and pauses', async ({ page }, testInfo) => {
  await page.clock.install();
  await openLab(page, ID, { seed: 3, difficulty: 1, party: 'starter', reducedMotion: false });
  const left = stage(page).getByRole('button', { name: 'Left', exact: true });
  const right = stage(page).getByRole('button', { name: 'Right', exact: true });
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('d');
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(14_000);
  expect(await stepOf(page)).toBeGreaterThan(200);
  await expect(stage(page).getByTestId('gr-feed')).toContainText(/Gate/);
  await shootGame(page, testInfo, ID, 'play');
  await page.keyboard.press('p');
  const pause = stage(page).getByRole('button', { name: 'Pause' });
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  const frozen = await stepOf(page);
  await page.clock.runFor(3000);
  expect(await stepOf(page)).toBe(frozen);
  await pause.click();
  await page.clock.runFor(1000);
  expect(await stepOf(page)).toBeGreaterThan(frozen);
});

// 3. Required: a game reaches an outcome (the Lab's Bot play).
test('plays to an outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 5, difficulty: 1 });
  const outcome = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(outcome.result);
  expect(Number(outcome.score)).toBeGreaterThan(0);
  expect(outcome.log).toMatch(/Gate /);
  await expectValidOutcome(page);
});

// 4. Required: the same seed gives the same outcome (Bot play twice, then again after a replay).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 3 });
  const first = await replaySameSeedWithBot(page);
  expect(['won', 'lost']).toContain(first.result);
  await expectValidOutcome(page);
});

test('Give up ends the run as fled, with a warm line', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 8, reducedMotion: false });
  await stage(page).getByRole('button', { name: 'Give up' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expect(stage(page).getByRole('status')).toContainText('step back');
  await shootGame(page, testInfo, ID, 'end');
  await expectValidOutcome(page);
});

test('plays in French on a hard run, with reduced motion', async ({ page }) => {
  await page.clock.install();
  await openLab(page, ID, { seed: 3, lang: 'fr', run: 'hard', party: 'mixed', reducedMotion: true });
  await expect(stage(page).getByRole('heading', { name: 'Ruée du Haven' })).toBeVisible();
  await expect(stage(page).getByRole('button', { name: 'Gauche' })).toBeVisible();
  await page.clock.runFor(3000);
  expect(await stepOf(page)).toBeGreaterThan(50);
  await expect(stage(page).getByTestId('gr-feed')).toContainText('Prochaines portes');
  const outcome = await botPlayToOutcome(page);
  expect(outcome.log).toMatch(/Porte /);
  await expectValidOutcome(page);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'full', run: 'buffed' });
  await expectResponsiveGame(page);
});

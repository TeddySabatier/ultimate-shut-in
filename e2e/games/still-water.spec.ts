/**
 * Still Water through the Games Lab. The three required tests come first.
 *
 * It is a real-time game of about a minute, so the real UI is driven with
 * Playwright's fake clock (`page.clock`): the page's animation frames only
 * advance when the test says so, which makes a scripted player exact and
 * keeps every test short. A whole game is played to the end with the Lab's
 * Bot play button (the engine playing itself); a human run of the same
 * length is covered by the Screen unit tests, with the same fake frames.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeed, shootGame } from './lab-helpers';

const ID = 'still-water';
const TICK_MS = 50;
/** Two seconds of get-ready come before the first breath in. */
const LEAD_MS = 2000;

/** Take over the page's clock: time only moves when the test runs it. */
async function freezeClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}

/** Begin, then let the get-ready lead go by (a little over, inside the grace). */
async function begin(page: Page): Promise<void> {
  await page.getByTestId('still-water-begin').click();
  await page.clock.runFor(LEAD_MS + 4 * TICK_MS);
}

/** One scripted perfect cycle with the keyboard: hold for the breath in and the rest, let go for the breath out. */
async function perfectCycle(page: Page, holdMs: number, outMs: number): Promise<void> {
  await page.keyboard.down('Space');
  await page.clock.runFor(holdMs);
  await page.keyboard.up('Space');
  await page.clock.runFor(outMs);
}

const stage = (page: Page) => page.getByTestId('lab-stage');

// 1. Required: it loads, and axe finds no serious violation (mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, reducedMotion: false, party: 'full', difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Still Water' })).toBeVisible();
  await expect(page.getByTestId('still-water-disclaimer')).toContainText(/not therapy/i);
  await expect(page.getByTestId('still-water-rhythm')).toContainText('In 4');
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'still water, ready');
  await page.getByTestId('still-water-begin').click();
  await expectNoSeriousA11yViolations(page, 'still water, playing');
});

// 2. Required: a full game reaches an outcome. The real UI plays the first breath with the fake clock,
// then Bot play (the engine, headless) plays the whole game.
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, reducedMotion: false, party: 'full', difficulty: 1 });
  await freezeClock(page);
  await begin(page);
  const cue = page.getByTestId('still-water-phase');
  const hold = page.getByTestId('still-water-hold');
  await expect(cue).toHaveText('Breathe in');
  await hold.hover();
  await page.mouse.down();
  await expect(hold).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(2500);
  await shootGame(page, testInfo, ID, 'play');
  await page.clock.runFor(2500);
  await expect(cue).toHaveText('Hold');
  await page.mouse.up();
  await expect(hold).toHaveAttribute('aria-pressed', 'false');
  await page.clock.runFor(1500);
  await expect(cue).toHaveText('Breathe out');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(cue).toHaveText(/Paused/);
  await page.getByRole('button', { name: 'Resume' }).click();
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(page.getByTestId('lab-outcome-log')).toContainText(/The pond is still/);
});

// 3. Required: replaying the same seed gives the same outcome. The scripted player breathes one perfect
// cycle (difficulty 5: 3 s in, 1 s rest, 3.5 s out) and then steps away: a partial score and log that depend
// on every tick being the same.
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, reducedMotion: false, party: 'full', difficulty: 5 });
  await freezeClock(page);
  const outcome = await replaySameSeed(page, async () => {
    await begin(page);
    await perfectCycle(page, 4000, 3500);
    await stage(page).getByRole('button', { name: 'Step away' }).click();
  });
  expect(outcome.result).toBe('fled');
  // One perfect cycle of eight, ceiling 900 (no ripple has passed yet, the calm is whole): 100 x 900 / 800, rounded.
  expect(outcome.score).toBe('113');
  expect(outcome.log).toMatch(/Cycle 1: the breath matched 100 %/);
});

// This game's own checks.
test('plays with the keyboard, in French, and steps away with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter', reducedMotion: false, difficulty: 1 });
  await freezeClock(page);
  await expect(stage(page).getByRole('heading', { name: 'Eau calme' })).toBeVisible();
  await expect(page.getByTestId('still-water-disclaimer')).toContainText('ni une thérapie');
  await begin(page);
  await expect(page.getByTestId('still-water-phase')).toHaveText('Inspire');
  // Focus goes to the big button, so Space is enough; Enter holds too.
  await expect(page.getByTestId('still-water-hold')).toBeFocused();
  await page.keyboard.down('Space');
  await expect(page.getByTestId('still-water-hold')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Space');
  await page.keyboard.down('Enter');
  await expect(page.getByTestId('still-water-hold')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Enter');
  await page.clock.runFor(5000);
  await expect(page.getByTestId('still-water-phase')).toHaveText('Retiens');
  await stage(page).getByRole('button', { name: "S'éloigner" }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expect(page.getByTestId('still-water-banner')).toContainText('Tu as quitté la berge');
  // The buttons are gone: the focus moves to the result, and the cue no longer gives an instruction.
  await expect(page.getByTestId('still-water-banner')).toBeFocused();
  await expect(page.getByTestId('still-water-phase')).toHaveText('Terminé');
  await expectValidOutcome(page);
});

test('a higher difficulty breathes faster, and a Move troop can choose the pace', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1, party: 'starter' });
  const rhythm = page.getByTestId('still-water-rhythm');
  const easy = (await rhythm.innerText()).replace(/\s/g, ' ');
  expect(easy).toBe('In 4 s · hold 2 s · out 6 s');
  await page.getByRole('button', { name: 'Slow' }).click();
  expect((await rhythm.innerText()).replace(/\s/g, ' ')).toBe('In 5 s · hold 2.5 s · out 7.5 s');
  await openLab(page, ID, { seed: 9, difficulty: 5, party: 'single' });
  expect((await rhythm.innerText()).replace(/\s/g, ' ')).toBe('In 3 s · hold 1 s · out 3.5 s');
  await expect(page.getByRole('button', { name: 'Slow' })).toHaveCount(0);
  await expectResponsiveGame(page);
});

test('reduced motion keeps the text cue with a bar instead of the ring; small and landscape phones fit', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', reducedMotion: true, difficulty: 3 });
  await expect(page.getByTestId('still-water-pond')).toHaveCount(0);
  await expect(page.getByRole('progressbar', { name: 'Breath' })).toBeVisible();
  await freezeClock(page);
  await begin(page);
  await expect(page.getByTestId('still-water-phase')).toHaveText('Breathe in');
  await expect(page.getByRole('progressbar', { name: 'Breath' })).toHaveAttribute('aria-valuetext', 'Breathe in');
  await page.keyboard.down('Space');
  await page.clock.runFor(2000);
  await shootGame(page, testInfo, ID, 'reduced');
  await page.keyboard.up('Space');
  await expectResponsiveGame(page);
});

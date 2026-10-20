/**
 * Still Water through the Games Lab. The three required tests come first.
 * Real-time play uses Bot play so each test stays under about 20 s.
 */
import { expect, test } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeed, shootGame } from './lab-helpers';

const ID = 'still-water';

// 1. Required: it loads, and axe finds no serious violation (mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, reducedMotion: false });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Still Water' })).toBeVisible();
  await expect(page.getByTestId('still-water-disclaimer')).toContainText(/not therapy/i);
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'still water');
});

// 2. Required: a full game reaches an outcome (Bot play; a few real UI inputs first).
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, reducedMotion: false });
  const hold = page.getByTestId('still-water-hold');
  await hold.dispatchEvent('pointerdown');
  await hold.dispatchEvent('pointerup');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('still-water-phase')).toContainText(/Paused/i);
  await page.getByRole('button', { name: 'Resume' }).click();
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(page.getByTestId('lab-outcome-log')).toContainText(/The pond is still/);
  await page.getByTestId('lab-stage').getByRole('button', { name: 'Step away' }).click();
  await expect(page.getByTestId('lab-stage').getByRole('status')).toHaveText(/You left the bank|The pond is still/);
  await shootGame(page, testInfo, ID, 'end');
});

// 3. Required: replaying the same seed gives the same outcome.
// Bot play in the Lab overwrites `previous`, so replaySameSeed cannot use it.
// Forfeit is the engine's own leave path and remounts cleanly.
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42 });
  const outcome = await replaySameSeed(page, async () => {
    await page.getByTestId('lab-stage').getByRole('button', { name: 'Step away' }).click();
  });
  expect(outcome.result).toBe('fled');
  expect(outcome.log).toMatch(/The pond is still|left the bank/i);
});

test('plays with the keyboard, in French, and forfeits with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Eau calme' })).toBeVisible();
  await page.keyboard.down('Space');
  await expect(stage.getByTestId('still-water-hold')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Space');
  await stage.getByRole('button', { name: "S'éloigner" }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('a higher difficulty uses a faster rhythm', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1, party: 'single' });
  const easy = await page.getByTestId('still-water-rhythm').innerText();
  await openLab(page, ID, { seed: 9, difficulty: 5, party: 'single' });
  const hard = await page.getByTestId('still-water-rhythm').innerText();
  expect(easy).toMatch(/4/);
  expect(easy).not.toEqual(hard);
});

test('reduced motion keeps the text cue; small and landscape phones fit', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', reducedMotion: true });
  await expect(page.getByTestId('still-water-phase')).toBeVisible();
  await expect(page.getByTestId('still-water-pond')).toHaveCount(0);
  await shootGame(page, testInfo, ID, 'reduced');
  await expectResponsiveGame(page);
});

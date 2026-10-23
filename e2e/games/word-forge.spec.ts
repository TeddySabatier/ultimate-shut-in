/**
 * Word Forge through the Games Lab. Full runs use Bot play so each test
 * stays under about 20 seconds.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeed, shootGame } from './lab-helpers';

const ID = 'word-forge';

/**
 * Play a multiple-choice run through the real UI. Pause first so the one-second
 * clock cannot change the score between two replays of the same seed.
 */
async function playByTapping(page: Page): Promise<void> {
  const stage = page.getByTestId('lab-stage');
  const pause = stage.getByRole('button', { name: 'Pause' });
  if ((await pause.count()) > 0) await pause.click();
  const options = stage.getByTestId('word-forge-options').getByRole('button');
  for (let i = 0; i < 80; i++) {
    if ((await stage.getByRole('status').count()) > 0) return;
    if ((await options.count()) === 0) return;
    await options.first().click();
  }
}

test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Word Forge' })).toBeVisible();
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'word forge');
});

test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  await playByTapping(page);
  expect(['won', 'lost']).toContain((await readOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(page.getByTestId('lab-stage').getByRole('status')).toHaveText(/forge holds|troops come home/i);
  await shootGame(page, testInfo, ID, 'end');
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 1 });
  const outcome = await replaySameSeed(page, () => playByTapping(page));
  expect(outcome.log.length).toBeGreaterThan(0);
});

test('plays with the keyboard, in French, and forfeits with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter', difficulty: 1 });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Forge des mots' })).toBeVisible();
  await page.keyboard.press('1');
  await expect(stage.getByTestId('word-forge-progress')).toBeVisible();
  await stage.getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('a higher difficulty switches from choices to typing', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  await expect(page.getByTestId('word-forge-options')).toBeVisible();
  await openLab(page, ID, { seed: 9, difficulty: 4 });
  await expect(page.getByTestId('word-forge-input')).toBeVisible();
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', difficulty: 1 });
  await expectResponsiveGame(page);
});

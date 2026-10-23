/**
 * Word Forge through the Games Lab. Full runs use Bot play so each test
 * stays under about 20 seconds.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'word-forge';

/** Play a multiple-choice run through the real UI by always forging the first option (misses come back). */
async function playByTapping(page: Page): Promise<void> {
  const stage = page.getByTestId('lab-stage');
  const options = stage.getByTestId('word-forge-options').getByRole('button');
  for (let i = 0; i < 100; i++) {
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
  // The speed bonus counts real seconds, so the replay check uses the headless bot (timing-proof).
  await openLab(page, ID, { seed: 42, difficulty: 2 });
  const outcome = await replaySameSeedWithBot(page);
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

test('a higher difficulty switches from choices to typing, played with the keyboard only', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  await expect(page.getByTestId('word-forge-options')).toBeVisible();
  await openLab(page, ID, { seed: 9, difficulty: 4 });
  const input = page.getByTestId('word-forge-input');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.type('wrongword');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('word-forge-progress')).toContainText('Strike 2');
  await expect(page.getByText(/Back into the fire/)).toContainText('Answer: ');
  await expect(input).toBeFocused();
  await shootGame(page, testInfo, ID, 'typed');
});

test('pausing hides the card', async ({ page }) => {
  await openLab(page, ID, { seed: 3, difficulty: 1 });
  const stage = page.getByTestId('lab-stage');
  await stage.getByRole('button', { name: 'Pause' }).click();
  await expect(stage.getByTestId('word-forge-options')).toHaveCount(0);
  await stage.getByRole('button', { name: 'Resume' }).click();
  await expect(stage.getByTestId('word-forge-options')).toBeVisible();
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', difficulty: 1 });
  await expectResponsiveGame(page);
});

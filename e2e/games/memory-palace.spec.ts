/**
 * Memory Palace through the Games Lab. The three required tests come first.
 * Look time is real-time, so a full walk uses Bot play. Replay uses the real
 * UI (Forfeit) because Bot play after "Replay same seed" clears the Lab's
 * previous outcome (a Lab quirk; see notes). Keep each test under ~20 s.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeed, shootGame } from './lab-helpers';

const ID = 'memory-palace';

async function skipLookToRecall(page: Page): Promise<void> {
  const next = page.getByTestId('lab-stage').getByRole('button', { name: 'Next' });
  for (let i = 0; i < 12 && (await next.count()) > 0; i++) await next.click();
  await expect(page.getByTestId('memory-palace-rooms')).toBeVisible();
}

/** One placement then Forfeit: a short, deterministic walk through the real UI. */
async function placeOnceAndForfeit(page: Page): Promise<void> {
  await skipLookToRecall(page);
  await page.getByTestId('lab-stage').getByRole('button', { name: 'Gate' }).click();
  await page.getByTestId('memory-palace-items').getByRole('button').first().click();
  await page.getByTestId('lab-stage').getByRole('button', { name: 'Forfeit' }).click();
}

test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Memory Palace' })).toBeVisible();
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'memory palace');
});

test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  await skipLookToRecall(page);
  await shootGame(page, testInfo, ID, 'recall');
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 1 });
  const outcome = await replaySameSeed(page, () => placeOnceAndForfeit(page));
  expect(outcome.log).toMatch(/Round 1: /);
});

test('plays in French and forfeits with a partial score', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter', difficulty: 1 });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Palais de mémoire' })).toBeVisible();
  await stage.getByRole('button', { name: 'Suivant' }).click();
  await stage.getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
  await expect(stage.getByRole('status')).toBeVisible();
  await shootGame(page, testInfo, ID, 'end');
});

test('a higher difficulty fields more things', async ({ page }) => {
  const counts = async () => {
    const text = await page.getByTestId('memory-palace-score').innerText();
    return Number(/of (\d+)/.exec(text)?.[1] ?? 0);
  };
  await openLab(page, ID, { seed: 9, difficulty: 1, party: 'starter' });
  const easy = await counts();
  await openLab(page, ID, { seed: 9, difficulty: 5, party: 'starter' });
  const hard = await counts();
  expect(hard).toBeGreaterThan(easy);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', difficulty: 1 });
  await expectResponsiveGame(page);
});

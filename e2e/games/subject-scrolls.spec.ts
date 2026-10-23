/**
 * Scroll Room through the Games Lab. Full runs use Bot play so each test
 * stays under about 20 seconds; the real UI covers the lobby, one
 * multiple-choice card with the keyboard, one typed card and the explanation.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'subject-scrolls';
const stage = (page: Page) => page.getByTestId('lab-stage');

async function begin(page: Page): Promise<void> {
  await stage(page).getByTestId('subject-scrolls-begin').click();
  await expect(stage(page).getByTestId('subject-scrolls-card')).toBeVisible();
}

test('loads in the Lab, shows the lobby and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Scroll Room' })).toBeVisible();
  await expect(stage(page).getByTestId('subject-scrolls-deck-kubernetes')).toHaveAttribute('aria-pressed', 'true');
  await shootGame(page, testInfo, ID, 'lobby');
  await begin(page);
  await expect(stage(page).getByTestId('subject-scrolls-options').getByRole('button')).toHaveCount(4);
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'scroll room, lobby then first card');
});

test('plays a full game to an outcome with Bot play', async ({ page }) => {
  await openLab(page, ID, { seed: 11, difficulty: 2 });
  const outcome = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(outcome.result);
  await expectValidOutcome(page);
  expect(outcome.log).toMatch(/scrolls hold|troops come home/i);
});

test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 3 });
  const outcome = await replaySameSeedWithBot(page);
  expect(outcome.log.length).toBeGreaterThan(0);
});

test('answers a card with the keyboard, reads the explanation and the source, then forfeits with a score', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 5, difficulty: 1, party: 'starter' });
  await begin(page);
  await page.keyboard.press('1');
  const explain = stage(page).getByTestId('subject-scrolls-explain');
  await expect(explain).toBeVisible();
  await expect(explain.getByRole('link', { name: /^Source: / })).toHaveAttribute('href', /^https:\/\//);
  await expect(stage(page).getByTestId('subject-scrolls-live')).toContainText('Answer:');
  await shootGame(page, testInfo, ID, 'explain');
  await expect(stage(page).getByTestId('subject-scrolls-next')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage(page).getByTestId('subject-scrolls-progress')).toContainText('Scroll 2');
  await stage(page).getByRole('button', { name: 'Close the room' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('types an answer at difficulty 4, in French', async ({ page }, testInfo) => {
  // Seed 3 opens on a typed card for the single party at difficulty 4; the walk below is a fallback if the decks change.
  await openLab(page, ID, { seed: 3, difficulty: 4, lang: 'fr', party: 'single' });
  await expect(stage(page).getByRole('heading', { name: 'Salle des parchemins' })).toBeVisible();
  await begin(page);
  // Walk to the first typed card (ordered cards are answered by tapping every step in the shown order).
  for (let i = 0; i < 20; i++) {
    const input = stage(page).getByTestId('subject-scrolls-input');
    if ((await input.count()) > 0) break;
    const steps = stage(page).getByTestId('subject-scrolls-steps').getByRole('button');
    if ((await steps.count()) > 0) {
      const n = await steps.count();
      for (let k = 0; k < n; k++) await steps.nth(k).click();
      await stage(page).getByTestId('subject-scrolls-order-submit').click();
    } else {
      await stage(page).getByTestId('subject-scrolls-options').getByRole('button').first().click();
    }
    await stage(page).getByTestId('subject-scrolls-next').click();
  }
  const input = stage(page).getByTestId('subject-scrolls-input');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.type('réponse improbable');
  await page.keyboard.press('Enter');
  await expect(stage(page).getByTestId('subject-scrolls-live')).toContainText('Réponse :');
  await shootGame(page, testInfo, ID, 'typed');
  await expect(stage(page).getByTestId('subject-scrolls-next')).toBeFocused();
});

test('fits small and landscape phones, in the lobby and on a card', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', difficulty: 1 });
  await expectResponsiveGame(page);
  await begin(page);
  await expectResponsiveGame(page);
});

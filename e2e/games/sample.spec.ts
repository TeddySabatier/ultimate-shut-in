/**
 * Coin Duel through the Games Lab: the full template for `e2e/games/<id>.spec.ts`.
 * The three required tests come first: it loads and axe passes (mobile project),
 * a full game reaches an outcome, and replaying the same seed gives the same outcome.
 * Then this game's own checks: keyboard, French, forfeit, difficulty, small screens.
 * Keep every test under about 20 s: play long or real-time games with Bot play
 * (botPlayToOutcome) and use the real UI for a few inputs only.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, outcomePanel, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'sample';

/** One full game through the real UI: send the first ally until the duel ends. */
async function playByTapping(page: Page): Promise<void> {
  const allies = page.getByTestId('lab-stage').getByRole('button', { name: /^Send / });
  const result = outcomePanel(page).getByTestId('lab-outcome-result');
  await expect(allies.first()).toBeVisible(); // the duel has mounted: never read an empty stage as "nothing to play"
  for (let i = 0; i < 5 && !(await result.isVisible()); i++) {
    await allies.first().click();
    await expect(allies.first().or(result)).toBeVisible(); // the next round, or the end of the duel
  }
}

// 1. Required: it loads, and axe finds no serious violation (the audit runs on the mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Coin Duel' })).toBeVisible();
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'coin duel');
});

// 2. Required: a full game reaches an outcome, through the real UI and through Bot play.
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  await playByTapping(page);
  expect(['won', 'lost']).toContain((await readOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(page.getByTestId('lab-stage').getByRole('status')).toHaveText(/Duel (won|lost)/);
  await shootGame(page, testInfo, ID, 'end');
  // A long or real-time game would only do this: the engine plays itself to the end.
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

// 3. Required: replaying the same seed gives the same outcome. Bot play and explicit waits, no tap loop: it cannot depend on timing.
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42 });
  const outcome = await replaySameSeedWithBot(page);
  expect(outcome.log).toMatch(/Round 1: /);
});

// This game's own checks.
test('plays with the keyboard, in French, and forfeits with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Duel de pièces' })).toBeVisible();
  await page.keyboard.press('1');
  await expect(stage.getByTestId('coin-duel-score')).toHaveText(/Toi [01], Rival [01]/);
  await stage.getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('a higher difficulty fields stronger rivals', async ({ page }) => {
  const rivalPowers = async () => (await page.getByTestId('coin-duel-rivals').getByRole('listitem').allTextContents()).map((t) => Number(/Power (\d+)/.exec(t)?.[1]));
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  const easy = await rivalPowers();
  await openLab(page, ID, { seed: 9, difficulty: 5 });
  const hard = await rivalPowers();
  expect(easy).toHaveLength(3);
  expect(hard.every((p, i) => p > (easy[i] ?? 0))).toBe(true);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed' });
  await expectResponsiveGame(page);
});

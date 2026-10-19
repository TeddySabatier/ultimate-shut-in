/**
 * Coin Duel through the Games Lab: the template for `e2e/games/<id>.spec.ts`.
 * Play by touch and by keyboard, in both languages, check the responsive
 * rules, and write the documentation screenshots.
 */
import { expect, test } from '@playwright/test';
import { expectResponsiveGame, openLab, readOutcome, shootGame } from './lab-helpers';

test('plays by tapping allies, in English', async ({ page }, testInfo) => {
  await openLab(page, 'sample', { seed: 11 });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Coin Duel' })).toBeVisible();
  await shootGame(page, testInfo, 'sample', 'start');
  const allies = stage.getByRole('button', { name: /^Send / });
  for (let i = 0; i < 5 && (await allies.count()) > 0; i++) await allies.first().click();
  const outcome = await readOutcome(page);
  expect(['won', 'lost']).toContain(outcome.result);
  await expect(stage.getByRole('status')).toHaveText(/Duel (won|lost)/);
  await shootGame(page, testInfo, 'sample', 'end');
});

test('plays with the keyboard, in French, and forfeits', async ({ page }) => {
  await openLab(page, 'sample', { seed: 5, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Duel de pièces' })).toBeVisible();
  await page.keyboard.press('1');
  await expect(stage.getByTestId('coin-duel-score')).toHaveText(/Vous [01], Rival [01]/);
  await stage.getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, 'sample', { seed: 2 });
  await expectResponsiveGame(page);
});

/**
 * The Games Lab (src/games/lab): lists the games, plays the sample to an
 * outcome through the UI, replays a seed identically, passes axe, and stays
 * closed in production without the debug flag.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, openLab, outcomePanel, readOutcome } from './games/lab-helpers';

/** Send the first ally until the duel ends. */
async function playDuel(page: Page): Promise<void> {
  const allies = page.getByTestId('lab-stage').getByRole('button', { name: /^Send / });
  for (let i = 0; i < 5 && (await allies.count()) > 0; i++) await allies.first().click();
}

test('the Lab lists the sample game and opens it', async ({ page }) => {
  await openLab(page);
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Coin Duel' }) });
  await expect(card.getByText('dev only')).toBeVisible();
  await expect(card.getByText('strategy')).toBeVisible();
  await page.getByRole('link', { name: 'Play Coin Duel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Coin Duel' })).toBeVisible();
  await expect(page).toHaveURL(/#\/lab\/sample\?seed=\d+/);
});

test('plays the sample to an outcome; replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, 'sample', { seed: 42 });
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  await playDuel(page);
  const first = await readOutcome(page);
  expect(first.log).toMatch(/Round 1: /);

  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  await playDuel(page);
  expect(await readOutcome(page)).toEqual(first);
  await expect(page.getByTestId('lab-compare')).toHaveText('Matches the previous run.');

  // The bot plays the engine headlessly and lands on an outcome too.
  await page.getByRole('button', { name: 'Bot play' }).click();
  await expect(outcomePanel(page).getByText(/^Bot play \(\d+ actions\)$/)).toBeVisible();
  await readOutcome(page);
  // The Lab never writes the player's save.
  expect(await page.evaluate(() => localStorage.getItem('haven.save'))).toBeNull();
});

test('axe passes on the Lab list and on a game screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await openLab(page);
  await expectNoSeriousA11yViolations(page, 'lab list');
  await openLab(page, 'sample', { seed: 3 });
  await expectNoSeriousA11yViolations(page, 'lab game');
  await playDuel(page);
  await readOutcome(page);
  await expectNoSeriousA11yViolations(page, 'lab game with an outcome');
});

test('without the debug flag the Lab redirects to the Haven (production build)', async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.goto('/#/lab/sample', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('lab-stage')).toHaveCount(0);
});

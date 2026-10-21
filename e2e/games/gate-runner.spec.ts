/**
 * Haven Rush through the Games Lab. The three required tests come first:
 * it loads and axe passes (mobile project), a full game reaches an outcome
 * (Bot play — this is a real-time game), and replaying the same seed matches.
 * Keep every test under about 20 s.
 */
import { expect, test } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, outcomePanel, readOutcome, shootGame } from './lab-helpers';

const ID = 'gate-runner';

test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Haven Rush' })).toBeVisible();
  await expect(page.getByTestId('gate-runner-squad')).toBeVisible();
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'haven rush');
});

test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  const stage = page.getByTestId('lab-stage');
  const left = stage.getByRole('button', { name: 'Left' });
  await left.hover();
  await page.mouse.down();
  await expect(stage.getByTestId('gate-runner-squad')).toBeVisible();
  await page.waitForTimeout(600);
  await shootGame(page, testInfo, ID, 'play');
  await page.mouse.up();
  await stage.getByRole('button', { name: 'Forfeit' }).click();
  await expect(stage.getByRole('status')).toHaveText(/The troops step back/);
  await shootGame(page, testInfo, ID, 'end');
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42 });
  // Bot play is the only deterministic full run for a real-time game. The Lab's
  // Bot play button overwrites `previous` (so lab-compare never appears); we
  // compare the two outcomes ourselves. See docs/review/notes/game-gate-runner.md.
  const first = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(first.result);
  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  const second = await botPlayToOutcome(page);
  expect(second).toEqual(first);
});

test('plays with the keyboard, in French, and forfeits with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Ruée du Haven' })).toBeVisible();
  await page.keyboard.down('ArrowLeft');
  await expect(stage.getByTestId('gate-runner-squad')).toHaveText(/Escouade \d+/);
  await page.keyboard.up('ArrowLeft');
  await stage.getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('a higher difficulty still loads a winnable lane', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  const easy = await page.getByTestId('gate-runner-squad').innerText();
  await openLab(page, ID, { seed: 9, difficulty: 5 });
  const hard = await page.getByTestId('gate-runner-squad').innerText();
  expect(easy).toMatch(/Squad \d+/);
  expect(hard).toMatch(/Squad \d+/);
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed' });
  await expectResponsiveGame(page);
});

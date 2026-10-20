/**
 * Decision Dungeon through the Games Lab. The three required tests come first.
 * Keep every test under about 20 s.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeed, shootGame } from './lab-helpers';

const ID = 'decision-dungeon';

async function playByTapping(page: Page): Promise<void> {
  const stage = page.getByTestId('lab-stage');
  for (let i = 0; i < 16; i++) {
    const door = stage.getByRole('button', { name: /^Door 1|^Porte 1/ });
    const next = stage.getByRole('button', { name: /Next room|Salle suivante/ });
    if ((await door.count()) > 0) await door.click();
    else if ((await next.count()) > 0) await next.click();
    else break;
  }
}

test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  await expect(page.getByTestId('lab-stage').getByRole('heading', { name: 'Decision Dungeon' })).toBeVisible();
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'decision dungeon');
});

test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  await playByTapping(page);
  expect(['won', 'lost']).toContain((await readOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(page.getByTestId('lab-stage').getByRole('status')).toHaveText(/troops come home/i);
  await shootGame(page, testInfo, ID, 'end');
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42 });
  const outcome = await replaySameSeed(page, () => playByTapping(page));
  expect(outcome.log).toMatch(/Room 1: /);
});

test('plays with the keyboard, in French, and steps away with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Donjon des choix' })).toBeVisible();
  await page.keyboard.press('1');
  await expect(stage.getByTestId('decision-dungeon-reflection')).toBeVisible();
  await stage.getByRole('button', { name: "S'éloigner" }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expectValidOutcome(page);
});

test('a higher difficulty hides the clearer wording', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1 });
  await expect(page.getByTestId('decision-dungeon-cue').first()).toBeVisible();
  await openLab(page, ID, { seed: 9, difficulty: 5 });
  await expect(page.getByTestId('decision-dungeon-cue')).toHaveCount(0);
  await expect(page.getByTestId('lab-stage').getByTestId('decision-dungeon-room')).toHaveText(/Room 1 of 7/);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed' });
  await expectResponsiveGame(page);
});

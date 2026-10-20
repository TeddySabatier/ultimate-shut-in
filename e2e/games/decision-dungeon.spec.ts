/**
 * Decision Dungeon through the Games Lab. The three required tests come first
 * (loads and axe, plays to an outcome, same seed same outcome), then this game's
 * own checks. Every test stays well under 20 s: a game is five to seven rooms.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeed, shootGame } from './lab-helpers';

const ID = 'decision-dungeon';

/** One whole run through the real UI: take door 1 in every room, then move on, until the result shows. */
async function playByTapping(page: Page): Promise<void> {
  const stage = page.getByTestId('lab-stage');
  const step = stage.getByRole('button', { name: /^(Door 1|Porte 1|Next room|Salle suivante|See the result|Voir le résultat)/ });
  const result = stage.getByTestId('decision-dungeon-result');
  for (let i = 0; i < 20; i++) {
    // Wait for the next thing to press, or for the end, so a render in between is never mistaken for the end.
    await expect(step.or(result).first()).toBeVisible();
    if ((await result.count()) > 0) break;
    await step.first().click();
  }
  await expect(result).toBeVisible();
}

// 1. Required: it loads, and axe finds no serious violation (the audit runs on the mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { level: 2, name: 'Decision Dungeon' })).toBeVisible();
  await expect(stage.getByText(/A game, not therapy/)).toBeVisible();
  await expect(stage.getByTestId('decision-dungeon-room')).toHaveText('Room 1 of 5');
  await expect(stage.getByTestId('decision-dungeon-options').getByRole('button')).not.toHaveCount(0);
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'decision dungeon');
});

// 2. Required: a full game reaches an outcome, through the real UI and through Bot play.
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11 });
  const stage = page.getByTestId('lab-stage');
  await stage.getByRole('button', { name: /^Door 1/ }).click();
  await expect(stage.getByTestId('decision-dungeon-reflection')).toContainText('You chose door 1');
  await shootGame(page, testInfo, ID, 'reflection');
  await stage.getByRole('button', { name: 'Next room' }).click();
  await playByTapping(page);
  expect(['won', 'lost']).toContain((await readOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(stage.getByRole('status')).toHaveText(/troops come home/i);
  await expect(stage.getByTestId('decision-dungeon-result')).toContainText('A tip to try');
  await shootGame(page, testInfo, ID, 'end');
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

// 3. Required: replaying the same seed gives the same outcome.
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42 });
  const outcome = await replaySameSeed(page, () => playByTapping(page));
  expect(outcome.log).toMatch(/Room 1: /);
});

// This game's own checks.
test('plays with the keyboard, in French, and steps away with a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByRole('heading', { name: 'Donjon des choix' })).toBeVisible();
  await expect(stage.getByText(/Un jeu, pas une thérapie/)).toBeVisible();
  await page.keyboard.press('1');
  await expect(stage.getByTestId('decision-dungeon-reflection')).toContainText('Tu as pris la porte 1');
  await expect(stage.getByRole('button', { name: 'Salle suivante' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage.getByTestId('decision-dungeon-room')).toHaveText('Salle 2 sur 5');
  await stage.getByRole('button', { name: "S'éloigner" }).click();
  const outcome = await readOutcome(page);
  expect(outcome.result).toBe('fled');
  expect(outcome.log).toMatch(/Salle 1/);
  await expectValidOutcome(page);
  await expect(stage.getByRole('status')).toHaveText(/rentrent plus tôt/);
});

test('a higher difficulty hides the plain cues and adds rooms', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 1, party: 'starter' });
  await expect(page.getByTestId('decision-dungeon-cue').first()).toBeVisible();
  await openLab(page, ID, { seed: 9, difficulty: 5, party: 'starter' });
  await expect(page.getByTestId('decision-dungeon-cue')).toHaveCount(0);
  await expect(page.getByTestId('lab-stage').getByTestId('decision-dungeon-room')).toHaveText('Room 1 of 7');
});

test('the party changes what the player sees: tags, the reframing question and Sleep on it', async ({ page }) => {
  await openLab(page, ID, { seed: 3, party: 'starter' });
  const stage = page.getByTestId('lab-stage');
  await expect(stage.getByTestId('decision-dungeon-tag')).toHaveCount(0);
  await expect(stage.getByTestId('decision-dungeon-reframe')).toHaveCount(0);
  await expect(stage.getByRole('button', { name: /^Sleep on it/ })).toHaveCount(0);
  await openLab(page, ID, { seed: 3, party: 'full' });
  await expect(stage.getByTestId('decision-dungeon-tag')).toHaveCount(1);
  await expect(stage.getByTestId('decision-dungeon-reframe')).toContainText('?');
  await stage.getByRole('button', { name: /^Sleep on it/ }).click();
  await stage.getByRole('button', { name: /^Preview door 1/ }).click();
  await expect(stage.getByTestId('decision-dungeon-peek')).toContainText('Sleeping on door 1');
  await expect(stage.getByTestId('decision-dungeon-reflection')).toHaveCount(0);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'full', difficulty: 1 });
  await expectResponsiveGame(page);
});

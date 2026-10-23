/**
 * Reading Race through the Games Lab. The three required tests come first.
 *
 * The real UI is driven in "show the whole sentence" mode (the accessibility
 * mode: one tap per sentence, so a human run takes a few seconds) and, for the
 * word-by-word clock, with a few real seconds of reading. The whole race of a
 * seed is also played by the engine with the Lab's Bot play button.
 */
import { expect, test, type Page } from '@playwright/test';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'reading-race';
const stage = (page: Page) => page.getByTestId('lab-stage');
const phase = (page: Page) => page.getByTestId('reading-race-phase');

/** Tap through the sentences of one passage with Space until the questions appear. */
async function readPassage(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if ((await phase(page).textContent()) !== 'reading') return;
    await page.keyboard.press('Space');
  }
}

/** Answer the three questions of a passage with the number keys (option 2 each time). */
async function answerPassage(page: Page): Promise<void> {
  await expect(phase(page)).toHaveText('questions');
  for (let q = 0; q < 3; q++) await page.keyboard.press('2');
}

/** One whole race through the real UI, in sentence mode. */
async function playByKeyboard(page: Page): Promise<void> {
  await stage(page).getByRole('button', { name: 'Show whole sentence' }).click();
  await stage(page).getByRole('button', { name: 'Start the race' }).click();
  for (let p = 0; p < 3; p++) {
    await readPassage(page);
    await answerPassage(page);
    if (p < 2) {
      await expect(phase(page)).toHaveText('interlude');
      await stage(page).getByRole('button', { name: 'Next passage' }).click();
    }
  }
}

// 1. Required: it loads, and axe finds no serious violation (mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, party: 'full', difficulty: 2 });
  await expect(stage(page).getByRole('heading', { name: 'Reading Race' })).toBeVisible();
  await expect(page.getByTestId('reading-race-practice')).toContainText('not a test of you');
  await expect(page.getByTestId('reading-race-wpm')).toContainText('200 words per minute');
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'reading race, ready');
  await stage(page).getByRole('button', { name: 'Start the race' }).click();
  await expect(phase(page)).toHaveText('reading');
  await expectNoSeriousA11yViolations(page, 'reading race, reading');
});

// 2. Required: a full game reaches an outcome through the real UI, and through Bot play.
test('plays a full game to an outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 11, party: 'starter', difficulty: 1 });
  await playByKeyboard(page);
  expect(['won', 'lost']).toContain((await readOutcome(page)).result);
  await expectValidOutcome(page);
  await expect(page.getByTestId('reading-race-banner')).toBeFocused();
  await expect(page.getByTestId('reading-race-summary')).toHaveText(/Understood \d of 9 .* Score \d+ of 1000\./);
  await expect(page.getByTestId('lab-outcome-log')).toContainText('Three passages, starting at 180 words per minute.');
  // Bot play: the engine reads and answers the same seed on its own.
  await page.getByRole('button', { name: 'Replay same seed' }).click();
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

// 3. Required: the same seed gives the same outcome (Bot play and explicit waits, no input loop).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, party: 'full' });
  const outcome = await replaySameSeedWithBot(page);
  expect(outcome.log).toMatch(/Passage 1: /);
});

// This game's own checks.
test('reads word by word on the clock, pauses with Space, and re-reads a sentence', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 3, party: 'starter', difficulty: 1, reducedMotion: false });
  await expect(stage(page).getByRole('button', { name: 'Start the race' })).toBeVisible();
  // The key listener is added right after the first paint: press Enter until the race has started.
  await expect(async () => {
    await page.keyboard.press('Enter');
    await expect(phase(page)).toHaveText('reading', { timeout: 500 });
  }).toPass({ timeout: 8000 });
  const word = page.getByTestId('reading-race-word').getByRole('img');
  await expect(word).toHaveAttribute('aria-label', /^Current words: \S+$/);
  const first = await word.getAttribute('aria-label');
  await expect(word).not.toHaveAttribute('aria-label', first ?? '', { timeout: 4000 });
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reading-race-word')).toHaveAttribute('data-paused', 'true');
  const held = await word.getAttribute('aria-label');
  await page.waitForTimeout(1200);
  await expect(word).toHaveAttribute('aria-label', held ?? '');
  await shootGame(page, testInfo, ID, 'reading');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('reading-race-word')).toHaveAttribute('data-paused', 'false');
  await page.keyboard.press('r');
  await expect(page.getByTestId('reading-race-feed')).toHaveText(/Back to the start of the sentence|Passage 1 of 3/);
  expect((await page.getByTestId('reading-race-reread').textContent()) ?? '').toContain('(-5)');
});

test('plays in French, with the pace set by the arrow keys', async ({ page }) => {
  await openLab(page, ID, { seed: 5, lang: 'fr', party: 'full', difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Course de lecture' })).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('reading-race-wpm')).toHaveText('220 mots par minute');
  await stage(page).getByRole('button', { name: 'Montrer la phrase entière' }).click();
  await stage(page).getByRole('button', { name: 'Lancer la course' }).click();
  await readPassage(page);
  await expect(phase(page)).toHaveText('questions');
  await expect(page.getByTestId('reading-race-recap')).toContainText("L’étude te rappelle la phrase-thème");
  await page.keyboard.press('1');
  await expect(page.getByTestId('reading-race-feed')).toHaveText(/C’est ça\.|Pas celle-là\. La réponse était/);
  await stage(page).getByRole('button', { name: 'Abandonner' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expect(page.getByTestId('reading-race-banner')).toContainText('Tu quittes la piste');
  await expectValidOutcome(page);
});

test('a higher difficulty has a higher slowest pace and harder reading; Bot play still finishes', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 5, party: 'single' });
  await expect(page.getByTestId('reading-race-wpm')).toHaveText('260 words per minute');
  await expect(stage(page).getByRole('button', { name: 'Slower' })).toBeDisabled();
  expect(['won', 'lost']).toContain((await botPlayToOutcome(page)).result);
  await expectValidOutcome(page);
});

test('hints and the Study recap show in the questions; forfeit keeps a partial score', async ({ page }) => {
  await openLab(page, ID, { seed: 7, party: 'full', run: 'buffed', difficulty: 2 });
  await expect(page.getByTestId('reading-race-perks')).toContainText('Hint buff');
  await stage(page).getByRole('button', { name: 'Show whole sentence' }).click();
  await stage(page).getByRole('button', { name: 'Start the race' }).click();
  await readPassage(page);
  await expect(page.getByTestId('reading-race-recap')).toBeVisible();
  const before = await page.locator('[data-testid^="reading-race-option-"]').count();
  await page.keyboard.press('h');
  await expect(page.locator('[data-testid^="reading-race-option-"]')).toHaveCount(Math.max(2, before - 1));
  await page.keyboard.press('1');
  await stage(page).getByRole('button', { name: 'Forfeit' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
});

test('fits small and landscape phones in every phase, with reduced motion', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', reducedMotion: true, difficulty: 3 });
  await expectResponsiveGame(page);
  await stage(page).getByRole('button', { name: 'Show whole sentence' }).click();
  await stage(page).getByRole('button', { name: 'Start the race' }).click();
  await expectResponsiveGame(page);
  await readPassage(page);
  await expect(phase(page)).toHaveText('questions');
  await expectResponsiveGame(page);
  // 390x844 with the text scaled to 150 percent: nothing may spill sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '150%'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.evaluate(() => (document.documentElement.style.fontSize = ''));
  await shootGame(page, testInfo, ID, 'questions');
});

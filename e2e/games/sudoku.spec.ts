/**
 * Sudoku through the Games Lab. The three required tests come first.
 *
 * A whole game is played through the real UI on the 6x6 board (difficulty 1):
 * keyboard entry, a note, an erase, then hints until the grid is solved. The
 * 9x9 boards are covered by Bot play, which solves by logic, and by checks of
 * the board, the keyboard and the small screens.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, outcomePanel, readOutcome, replaySameSeedWithBot, shootGame, botPlayToOutcome } from './lab-helpers';

const ID = 'sudoku';
const stage = (page: Page) => page.getByTestId('lab-stage');
const cell = (page: Page, i: number) => page.getByTestId(`sudoku-cell-${i}`);
const live = (page: Page) => page.getByTestId('sudoku-live');
const BLANK = /: empty$/;

/** The index of the first blank cell, read from the cell names. */
async function firstBlank(page: Page): Promise<number> {
  await expect(page.getByRole('gridcell').first()).toBeVisible(); // the board has mounted: never read an empty stage
  const labels = await page.locator('[data-testid^="sudoku-cell-"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  return labels.findIndex((l) => /: empty$/.test(l));
}

// 1. Required: it loads, and axe finds no serious violation (mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 7, difficulty: 4, party: 'full' });
  await expect(stage(page).getByRole('heading', { name: 'Sudoku' })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Sudoku board, 9 by 9' })).toBeVisible();
  await expect(page.getByRole('gridcell')).toHaveCount(81);
  await expect(page.getByTestId('sudoku-board-line')).toContainText('Medium · 9 by 9');
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'sudoku, start');
  await page.getByTestId('sudoku-notes').click();
  await page.getByTestId('sudoku-pad-3').click();
  await page.getByText('How to play').click();
  await expectNoSeriousA11yViolations(page, 'sudoku, notes and help open');
});

// 2. Required: a full game reaches an outcome, through the real UI (keyboard, a note, an erase, hints) and through Bot play.
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 3, difficulty: 1, party: 'starter' });
  const first = await firstBlank(page);
  // Keyboard entry: arrows, a digit, then erase it again.
  await cell(page, first).click();
  await expect(cell(page, first)).toBeFocused();
  await page.keyboard.press('1');
  await expect(cell(page, first)).not.toHaveAttribute('aria-label', BLANK);
  await expect(live(page)).toContainText('Row');
  await page.keyboard.press('Backspace');
  await expect(cell(page, first)).toHaveAttribute('aria-label', BLANK);
  // A note, on the same cell.
  await page.keyboard.press('n');
  await page.keyboard.press('2');
  await page.keyboard.press('5');
  await expect(cell(page, first)).toHaveAttribute('aria-label', /empty, notes 2 5$/);
  await page.keyboard.press('n');
  await page.keyboard.press('Backspace');
  // A hint explains itself, then hints solve the grid.
  await page.keyboard.press('h');
  await expect(page.getByTestId('sudoku-hints')).toHaveText('1');
  await expect(live(page)).toContainText(/can only be a|fits in only one cell|Nothing simpler|rule out/);
  await shootGame(page, testInfo, ID, 'play');
  const result = outcomePanel(page).getByTestId('lab-outcome-result');
  for (let i = 0; i < 40 && !(await result.isVisible()); i++) await page.keyboard.press('h');
  const out = await readOutcome(page);
  expect(out.result).toBe('won');
  expect(Number(out.score)).toBeGreaterThan(500);
  expect(Number(out.score)).toBeLessThan(1000); // hints cost points
  expect(out.log).toContain('Grid solved');
  await expectValidOutcome(page);
  await expect(page.getByTestId('sudoku-result')).toContainText('Solved in');
  await expect(page.getByTestId('sudoku-pad-1')).toBeDisabled();
  await shootGame(page, testInfo, ID, 'end');
  // Bot play: the engine solves another grid by logic.
  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  expect((await botPlayToOutcome(page)).result).toBe('won');
  await expectValidOutcome(page);
});

// 3. Required: replaying the same seed gives the same outcome (Bot play and explicit waits, no tap loop).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 5, party: 'full' });
  const outcome = await replaySameSeedWithBot(page);
  expect(outcome.result).toBe('won');
  expect(Number(outcome.score)).toBeGreaterThan(900);
});

// This game's own checks.
test('arrow keys move the one tab stop; a wrong digit is flagged by Check and fixed with Erase', async ({ page }) => {
  await openLab(page, ID, { seed: 9, difficulty: 3, party: 'single' });
  const first = await firstBlank(page);
  await cell(page, first).click();
  await page.keyboard.press('Home');
  const rowStart = Math.floor(first / 9) * 9;
  await expect(cell(page, rowStart)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, rowStart + 1)).toBeFocused();
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  // Put a digit that is certainly wrong for the blank cell: one its row already holds as a given.
  const labels = await page.locator('[data-testid^="sudoku-cell-"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const row = Math.floor(first / 9);
  const given = labels.slice(row * 9, row * 9 + 9).map((l) => /: (\d), given$/.exec(l)?.[1]).find(Boolean)!;
  await cell(page, first).click();
  await page.keyboard.press(given);
  await expect(live(page)).toContainText('conflicts with another');
  await expect(page.getByTestId('sudoku-slips')).toHaveText('1');
  await page.getByTestId('sudoku-check').click();
  await expect(live(page)).toContainText('1 digit is off');
  await expect(cell(page, first)).toHaveAttribute('aria-label', /marked wrong/);
  await page.getByTestId('sudoku-erase').click();
  await expect(cell(page, first)).toHaveAttribute('aria-label', BLANK);
  await page.keyboard.press('Control+z');
  await expect(live(page)).toContainText('Undone');
  await expect(cell(page, first)).not.toHaveAttribute('aria-label', BLANK);
});

test('Stop here keeps the board and ends with a partial score; Leave is a separate press', async ({ page }) => {
  await openLab(page, ID, { seed: 5, difficulty: 2, party: 'full' });
  for (let i = 0; i < 4; i++) await page.getByTestId('sudoku-hint').click();
  await stage(page).getByRole('button', { name: 'Stop here' }).click();
  const out = await readOutcome(page);
  expect(out.result).toBe('fled');
  expect(Number(out.score)).toBeGreaterThan(0);
  expect(Number(out.score)).toBeLessThanOrEqual(500);
  await expect(page.getByRole('gridcell')).toHaveCount(36);
  await expect(page.getByTestId('sudoku-result')).toContainText('troops come home');
  await expect(page.getByRole('button', { name: 'Stop here' })).toHaveCount(0);
  await expectValidOutcome(page);
});

test('French, and a party that changes the game: Study gives free hints, Sleep stretches the par', async ({ page }) => {
  await openLab(page, ID, { seed: 11, lang: 'fr', difficulty: 3, party: 'full' });
  await expect(stage(page).getByRole('heading', { name: 'Sudoku' })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Grille de sudoku, 9 sur 9' })).toBeVisible();
  await expect(page.getByTestId('sudoku-hint')).toContainText('2 offerts');
  await expect(page.getByTestId('sudoku-board-line')).toContainText('Facile · 9 sur 9');
  await page.getByText('Comment jouer').click();
  await expect(page.getByTestId('sudoku-perks')).toContainText('(Sommeil)');
  await page.getByTestId('sudoku-hint').click();
  await expect(live(page)).toContainText(/Ligne \d, colonne \d|Dans (la|le) /);
  await page.getByTestId('sudoku-notes').click();
  await expect(page.getByTestId('sudoku-notes')).toHaveText('Notes\u00a0: oui');
  // The same seed with a starter party has no free hint and a shorter par.
  await openLab(page, ID, { seed: 11, lang: 'fr', difficulty: 3, party: 'starter' });
  await expect(page.getByTestId('sudoku-hint')).not.toContainText('offerts');
});

test('the difficulty picks the board: 6x6 at 1 and 2, 9x9 from 3, fewer digits given as it climbs', async ({ page }) => {
  const clues: number[] = [];
  for (const [difficulty, cells] of [[1, 36], [2, 36], [3, 81], [4, 81], [5, 81]] as const) {
    await openLab(page, ID, { seed: 13, difficulty });
    await expect(page.getByRole('gridcell')).toHaveCount(cells);
    const line = await page.getByTestId('sudoku-board-line').innerText();
    clues.push(Number(/(\d+) digits given/.exec(line)![1]));
  }
  expect(clues[2]!).toBeGreaterThan(clues[3]!);
  expect(clues[3]!).toBeGreaterThan(clues[4]!);
});

test('Pause hides the board and stops the clock', async ({ page }) => {
  await openLab(page, ID, { seed: 6, difficulty: 3, reducedMotion: false });
  await page.getByTestId('sudoku-pause').click();
  await expect(page.getByTestId('sudoku-paused')).toBeVisible();
  await expect(page.getByRole('gridcell')).toHaveCount(0);
  const t = await page.getByTestId('sudoku-time').innerText();
  await page.waitForTimeout(1300);
  await expect(page.getByTestId('sudoku-time')).toHaveText(t);
  await page.getByTestId('sudoku-pause').click();
  await expect(page.getByRole('gridcell')).toHaveCount(81);
});

test('small and landscape phones fit, with reduced motion too', async ({ page }) => {
  await openLab(page, ID, { seed: 2, difficulty: 4, party: 'full', reducedMotion: true });
  await page.getByTestId('sudoku-notes').click();
  await page.getByTestId('sudoku-pad-2').click();
  await expectResponsiveGame(page);
  await openLab(page, ID, { seed: 2, difficulty: 1, party: 'mixed' });
  await expectResponsiveGame(page);
});

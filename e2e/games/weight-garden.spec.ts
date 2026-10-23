/**
 * Weight Garden through the Games Lab. The three required tests come first.
 *
 * A whole easy game (difficulty 1: three plots) is played through the real
 * UI with a fixed seed: sliders on the hand-turned plot, the learning rate and
 * Train on the second, hidden neurons on the XOR plot. The longer game
 * (five plots) is covered by Bot play.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  botPlayToOutcome,
  expectNoSeriousA11yViolations,
  expectResponsiveGame,
  expectValidOutcome,
  openLab,
  outcomePanel,
  readOutcome,
  replaySameSeedWithBot,
  shootGame,
} from './lab-helpers';

const ID = 'weight-garden';
const stage = (page: Page) => page.getByTestId('lab-stage');
const tid = (page: Page, id: string) => page.getByTestId(`weight-garden-${id}`);

/** Seed 7, difficulty 1: the centroid line of the first plot is -1.6 x + 1.2 y + 0. */
const SEED = 7;

async function solveFirstPlot(page: Page) {
  await tid(page, 'w0').fill('-1.6');
  await tid(page, 'w1').fill('1.2');
  await tid(page, 'w2').fill('0');
  await expect(tid(page, 'settled')).toBeVisible();
}

// 1. Required: it loads, and axe finds no serious violation (mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: SEED, difficulty: 3, party: 'full' });
  await expect(stage(page).getByRole('heading', { name: 'Weight Garden', level: 2 })).toBeVisible();
  await expect(tid(page, 'plot-title')).toContainText('Plot 1 of 5: One neuron');
  await expect(tid(page, 'plot')).toBeVisible();
  await expect(tid(page, 'live')).toHaveText(/^accuracy \d+ percent, loss \d+\.\d\d$/);
  await expect(stage(page).getByRole('slider')).toHaveCount(3);
  await shootGame(page, testInfo, ID, 'start');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'weight garden, first plot');
  await stage(page).getByText('How to read the garden').click();
  await stage(page).getByText('Show the numbers').click();
  await expectNoSeriousA11yViolations(page, 'weight garden, help open');
});

// 2. Required: a full game reaches an outcome through the real UI (sliders, learning rate, Train, hidden neurons) and through Bot play.
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: SEED, difficulty: 1, party: 'full' });
  await expect(tid(page, 'plot-title')).toContainText('Plot 1 of 3');
  // Plot 1: the weights by hand. A slider is keyboard operable too.
  await tid(page, 'w2').focus();
  const bias = Number(await tid(page, 'w2').inputValue());
  await page.keyboard.press('ArrowRight');
  expect(Number(await tid(page, 'w2').inputValue())).toBeCloseTo(bias + 0.1, 5);
  await solveFirstPlot(page);
  await expect(tid(page, 'settled')).toContainText('One neuron draws one straight line');
  await expect(tid(page, 'coach')).toContainText('The line splits the seeds');
  await tid(page, 'next').click();
  // Plot 2: a learning rate that is too low creeps; raise it with the keyboard, then Train with the T key.
  await expect(tid(page, 'plot-title')).toContainText('Plot 2 of 3: Auto-train');
  await tid(page, 'lr').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(stage(page).getByText('Learning rate:')).toContainText('0.15');
  const firstLoss = await tid(page, 'loss').innerText();
  await page.keyboard.press('t');
  await expect(tid(page, 'loss')).not.toHaveText(firstLoss);
  await page.keyboard.press('t');
  await expect(tid(page, 'presses')).toContainText(/Presses left \d+ of/);
  await shootGame(page, testInfo, ID, 'train');
  for (let i = 0; i < 8 && !(await tid(page, 'settled').isVisible()); i++) await tid(page, 'train-button').click();
  await expect(tid(page, 'settled')).toContainText('Gradient descent nudges every weight');
  await tid(page, 'next').click();
  // Plot 3: XOR. One neuron cannot do it: add hidden neurons and train.
  await expect(tid(page, 'plot-title')).toContainText('Plot 3 of 3: The XOR plot');
  await expect(tid(page, 'hidden')).toHaveText('One neuron');
  await page.keyboard.press('a');
  await page.keyboard.press('a');
  await page.keyboard.press('a');
  await expect(tid(page, 'hidden')).toHaveText('Hidden neurons: 4');
  await expect(tid(page, 'add')).toBeDisabled();
  for (let i = 0; i < 16 && !(await tid(page, 'settled').isVisible()); i++) await tid(page, 'train-button').click();
  await expect(tid(page, 'settled')).toBeVisible();
  await tid(page, 'next').click();
  const out = await readOutcome(page);
  expect(out.result).toBe('won');
  expect(Number(out.score)).toBeGreaterThan(600);
  expect(out.log).toContain('Plot 3 (The XOR plot)');
  await expectValidOutcome(page);
  await expect(tid(page, 'result')).toContainText('The garden holds');
  await expect(tid(page, 'train-button')).toHaveCount(0);
  await shootGame(page, testInfo, ID, 'end');
  // Bot play: the engine plays a five-plot game on another seed.
  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  expect((await botPlayToOutcome(page)).result).toBe('won');
  await expectValidOutcome(page);
});

// 3. Required: replaying the same seed gives the same outcome (Bot play and explicit waits, no tap loop).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 3, party: 'full' });
  const outcome = await replaySameSeedWithBot(page);
  expect(['won', 'lost']).toContain(outcome.result);
  expect(Number(outcome.score)).toBeGreaterThan(300);
});

// This game's own checks.
test('Stop here keeps the garden on screen and ends as fled; Leave is a separate press', async ({ page }) => {
  await openLab(page, ID, { seed: SEED, difficulty: 1, party: 'starter' });
  await solveFirstPlot(page);
  await tid(page, 'next').click();
  await tid(page, 'forfeit').click();
  const out = await readOutcome(page);
  expect(out.result).toBe('fled');
  expect(Number(out.score)).toBeGreaterThan(0);
  await expect(tid(page, 'plot')).toBeVisible();
  await expect(tid(page, 'result')).toContainText('stepped out of the garden');
  await expect(tid(page, 'forfeit')).toHaveCount(0);
  await expectValidOutcome(page);
});

test('the plot count follows the difficulty, and too high a rate flies apart without costing a try', async ({ page }) => {
  await openLab(page, ID, { seed: SEED, difficulty: 2, party: 'full' });
  await expect(stage(page).getByRole('listitem').filter({ hasText: /^Plot \d/ })).toHaveCount(4);
  await solveFirstPlot(page);
  await tid(page, 'next').click();
  await tid(page, 'lr').focus();
  await page.keyboard.press('End');
  await expect(stage(page).getByText('Learning rate:')).toContainText('3.00');
  await page.keyboard.press('t');
  await expect(tid(page, 'coach')).toContainText('weights flew apart');
  await expect(tid(page, 'tries')).toHaveText('Try 1 of 3');
  await expect(stage(page).getByTestId('weight-garden-loss-chart')).toBeVisible();
});

test('French, and a party that changes the game: Move adds steps, Study reads the curve', async ({ page }) => {
  await openLab(page, ID, { seed: SEED, lang: 'fr', difficulty: 1, party: 'full' });
  await expect(stage(page).getByRole('heading', { name: 'Jardin des poids', level: 2 })).toBeVisible();
  await expect(tid(page, 'live')).toHaveText(/^précision \d+ pour cent, perte \d+\.\d\d$/);
  await solveFirstPlot(page);
  await tid(page, 'next').click();
  await expect(tid(page, 'train-button')).toContainText('Faire 7 pas'); // 4 steps plus 3 from Move
  await expect(stage(page).getByText('Étude lit la courbe')).toBeVisible();
  await openLab(page, ID, { seed: SEED, lang: 'fr', difficulty: 1, party: 'starter' });
  await solveFirstPlot(page);
  await tid(page, 'next').click();
  await expect(tid(page, 'train-button')).toContainText('Faire 4 pas');
  await expect(tid(page, 'coach')).toContainText('Pas de troupe Étude');
});

test('small and landscape phones fit, on the first plot and on a plot with a hidden layer', async ({ page }) => {
  await openLab(page, ID, { seed: SEED, difficulty: 1, party: 'full', reducedMotion: true });
  await expectResponsiveGame(page);
  await solveFirstPlot(page);
  await tid(page, 'next').click();
  await expectResponsiveGame(page);
  await openLab(page, ID, { seed: 42, difficulty: 3, party: 'mixed' });
  await expectResponsiveGame(page);
});

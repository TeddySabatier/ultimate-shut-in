/**
 * Memory Palace through the Games Lab. The three required tests come first.
 *
 * The look is timed, but "Next" skips the wait, so a real human game is quick:
 * the spec mirrors the engine (a pure module, imported like the chess spec
 * does) to know where each thing really is, then plays through the UI.
 * Keep each test under about 20 s.
 */
import { expect, test, type Page } from '@playwright/test';
import { emptyRun, makeMember, type Party } from '../../src/games/contract';
import { engine, ROOM_IDS, type RoundPlan } from '../../src/games/memory-palace/engine';
import { wordText } from '../../src/games/memory-palace/words';
import { botPlayToOutcome, expectNoSeriousA11yViolations, expectResponsiveGame, expectValidOutcome, openLab, outcomePanel, readOutcome, replaySameSeedWithBot, shootGame } from './lab-helpers';

const ID = 'memory-palace';
const stage = (page: Page) => page.getByTestId('lab-stage');

/** Three level-1 vassals with no Study, Sleep or Social: rooms and things do not depend on the party. */
const STARTER: Party = { members: ['move', 'outside', 'clean'].map((h) => makeMember({ id: h, name: h, habit: h as never, level: 1, loyalty: 50 })) };

function plan(seed: number, difficulty: 1 | 2 | 3 | 4 | 5, locale: 'en' | 'fr' = 'en'): RoundPlan[] {
  return engine.initial(seed, STARTER, emptyRun(difficulty), locale).rounds;
}

async function walkRound(page: Page, begin: string, next: string): Promise<void> {
  await stage(page).getByRole('button', { name: begin }).click();
  const nextBtn = stage(page).getByRole('button', { name: next });
  for (let i = 0; i < 12 && (await nextBtn.count()) > 0; i++) await nextBtn.click();
  await expect(page.getByTestId('memory-palace-rooms')).toBeVisible();
}

async function putBack(page: Page, round: RoundPlan, locale: 'en' | 'fr' = 'en', limit = round.items.length): Promise<void> {
  for (const it of round.items.slice(0, limit)) {
    await page.getByTestId('memory-palace-items').getByRole('button', { name: wordText(it.wordId, locale), exact: true }).click();
    await page.getByTestId('memory-palace-rooms').getByRole('button').nth(ROOM_IDS.indexOf(it.roomId)).click();
  }
}

// 1. Required: it loads, and axe finds no serious violation (mobile project only).
test('loads in the Lab and passes axe', async ({ page }, testInfo) => {
  await openLab(page, ID, { seed: 11, difficulty: 1, party: 'starter' });
  await expect(stage(page).getByRole('heading', { name: 'Memory Palace' })).toBeVisible();
  await expect(page.getByTestId('memory-palace-prompt')).toContainText(/palace is empty again/);
  await stage(page).getByRole('button', { name: 'Begin the walk' }).click();
  await expect(page.getByText('Thing 1 of 2')).toBeVisible();
  await shootGame(page, testInfo, ID, 'look');
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the a11y audit runs on the mobile project only');
  await expectNoSeriousA11yViolations(page, 'memory palace, look');
  const next = stage(page).getByRole('button', { name: 'Next' });
  for (let i = 0; i < 2; i++) await next.click();
  await expect(page.getByTestId('memory-palace-rooms')).toBeVisible();
  await expectNoSeriousA11yViolations(page, 'memory palace, recall');
});

// 2. Required: a full game reaches an outcome through the real UI: three rounds, every thing back in its room.
test('plays a full game to an outcome', async ({ page }, testInfo) => {
  const seed = 11;
  await openLab(page, ID, { seed, difficulty: 1, party: 'starter' });
  const rounds = plan(seed, 1);
  for (let r = 0; r < rounds.length; r++) {
    await walkRound(page, 'Begin the walk', 'Next');
    if (r === 1) await shootGame(page, testInfo, ID, 'recall');
    await putBack(page, rounds[r]!);
  }
  await expect(page.getByTestId('memory-palace-end')).toContainText('The palace remembers with you');
  const out = await readOutcome(page);
  expect(out.result).toBe('won');
  expect(out.score).toBe('1000');
  await expectValidOutcome(page);
  await expect(page.getByTestId('lab-outcome-log')).toContainText('You placed 12 of 12');
  await shootGame(page, testInfo, ID, 'end');
});

// 3. Required: the same seed replays to the same outcome (Bot play twice, then after a remount).
test('replaying the same seed gives the same outcome', async ({ page }) => {
  await openLab(page, ID, { seed: 42, difficulty: 3 });
  const first = await replaySameSeedWithBot(page);
  expect(['won', 'lost']).toContain(first.result);
});

test('a wrong room is told in words and a symbol, and a game can be forfeited with a partial score', async ({ page }) => {
  const seed = 5;
  await openLab(page, ID, { seed, difficulty: 1, party: 'starter' });
  const first = plan(seed, 1)[0]!.items[0]!;
  await walkRound(page, 'Begin the walk', 'Next');
  const wrongRoom = ROOM_IDS.indexOf(first.roomId) === 0 ? 1 : 0;
  await page.getByTestId('memory-palace-items').getByRole('button', { name: wordText(first.wordId, 'en'), exact: true }).click();
  await page.getByTestId('memory-palace-rooms').getByRole('button').nth(wrongRoom).click();
  await expect(page.getByTestId('memory-palace-prompt')).toContainText('not there');
  await expect(page.getByTestId('memory-palace-rooms')).toContainText('×');
  await expect(page.getByTestId('memory-palace-score')).toContainText('0 of 12');
  await stage(page).getByRole('button', { name: 'Forfeit' }).click();
  expect((await readOutcome(page)).result).toBe('fled');
  await expect(page.getByTestId('memory-palace-end')).toBeVisible();
});

test('can be played from the keyboard alone', async ({ page }) => {
  await openLab(page, ID, { seed: 7, difficulty: 1, party: 'starter' });
  const focused = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  // The Begin button has the focus: Enter walks, Enter again moves to the next thing.
  await expect(stage(page).getByRole('button', { name: 'Begin the walk' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stage(page).getByRole('button', { name: 'Next' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('memory-palace-rooms')).toBeVisible();
  // The first thing has the focus: pick it, then Tab to the rooms and pick one.
  const firstThing = await focused();
  expect(firstThing.length).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('memory-palace-prompt')).toContainText(`Thing chosen: ${firstThing}`);
  for (let i = 0; i < 12; i++) {
    const inRooms = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="memory-palace-rooms"]'));
    if (inRooms) break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('memory-palace-prompt')).toContainText(new RegExp(`${firstThing}, .*: (yes|not there)`));
  await expect(page.getByTestId('memory-palace-score')).toContainText(/of 12 in place/);
});

test('plays in French', async ({ page }) => {
  const seed = 5;
  await openLab(page, ID, { seed, lang: 'fr', party: 'starter', difficulty: 1 });
  await expect(stage(page).getByRole('heading', { name: 'Palais de mémoire' })).toBeVisible();
  const rounds = plan(seed, 1, 'fr');
  await walkRound(page, 'Commencer la promenade', 'Suivant');
  await putBack(page, rounds[0]!, 'fr');
  await expect(page.getByTestId('memory-palace-round')).toContainText('Manche 2 sur 3');
  await stage(page).getByRole('button', { name: 'Abandonner' }).click();
  const out = await readOutcome(page);
  expect(out.result).toBe('fled');
  expect(out.log).toContain('Manche 1 : 2 sur 2');
});

test('a higher difficulty fields more things and a shorter look', async ({ page }) => {
  const total = async () => Number(/of (\d+)/.exec(await page.getByTestId('memory-palace-score').innerText())?.[1] ?? 0);
  await openLab(page, ID, { seed: 9, difficulty: 1, party: 'starter' });
  const easy = await total();
  await openLab(page, ID, { seed: 9, difficulty: 5, party: 'starter' });
  expect(await total()).toBeGreaterThan(easy);
  await stage(page).getByRole('button', { name: 'Begin the walk' }).click();
  await expect(stage(page).getByText(/^[1-3] s left$/)).toBeVisible();
});

test('a full party shows its perks and the Social tip', async ({ page }) => {
  await openLab(page, ID, { seed: 3, difficulty: 2, party: 'full' });
  await expect(stage(page)).toContainText('(Study) can reveal a first letter');
  await expect(stage(page)).toContainText('(Sleep) rested');
  await walkRound(page, 'Begin the walk', 'Next');
  await expect(stage(page).getByText('A friend counted with you')).toBeVisible();
  await stage(page).getByRole('button', { name: /A letter/ }).click();
  await expect(stage(page).getByText('Letters you asked for')).toBeVisible();
});

test('bot play reaches an outcome with the rooms of a hard run', async ({ page }) => {
  await openLab(page, ID, { seed: 8, run: 'hard', party: 'mixed' });
  const out = await botPlayToOutcome(page);
  expect(['won', 'lost']).toContain(out.result);
  await expectValidOutcome(page);
  await expect(outcomePanel(page).getByTestId('lab-outcome-log')).toContainText(/Round 1:/);
});

test('fits small and landscape phones', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'mixed', difficulty: 3 });
  await expectResponsiveGame(page);
  await stage(page).getByRole('button', { name: 'Begin the walk' }).click();
  await expectResponsiveGame(page);
  const next = stage(page).getByRole('button', { name: 'Next' });
  for (let i = 0; i < 12 && (await next.count()) > 0; i++) await next.click();
  await expect(page.getByTestId('memory-palace-rooms')).toBeVisible();
  await expectResponsiveGame(page);
});

test('honours reduced motion: a text countdown, no animated bar', async ({ page }) => {
  await openLab(page, ID, { seed: 2, party: 'starter', difficulty: 1, reducedMotion: true });
  await stage(page).getByRole('button', { name: 'Begin the walk' }).click();
  await expect(stage(page).getByText(/\d+ s left/)).toBeVisible();
  await expect(stage(page).getByRole('progressbar')).toHaveCount(0);
});

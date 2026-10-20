/**
 * Helpers for game e2e specs (`e2e/games/<id>.spec.ts`). Every game is driven
 * through the Games Lab (`#/lab/<id>`), which mounts its Screen with the test
 * parties and runs and shows the Outcome panel.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';
import { fontsReady, freshApp } from '../helpers';

export interface LabOptions {
  seed?: number;
  lang?: 'en' | 'fr';
  /** The fixtures: full (8 vassals, level 12), starter (3, level 1), single (1, level 5), mixed (a citizen and 4 vassals). */
  party?: 'full' | 'starter' | 'single' | 'mixed';
  /** plain (difficulty 2), buffed (attack, time, hint; difficulty 2), hard (room 4, difficulty 5). */
  run?: 'plain' | 'buffed' | 'hard';
  /** 1..5: overrides the run's difficulty. */
  difficulty?: 1 | 2 | 3 | 4 | 5;
  reducedMotion?: boolean;
}

/** URL hash of a game in the Lab. */
export function labPath(id: string, o: LabOptions = {}): string {
  const q = new URLSearchParams({
    seed: String(o.seed ?? 1),
    lang: o.lang ?? 'en',
    party: o.party ?? 'full',
    run: o.run ?? 'plain',
    rm: o.reducedMotion === false ? '0' : '1',
  });
  if (o.difficulty !== undefined) q.set('difficulty', String(o.difficulty));
  return `/lab/${id}?${q.toString()}`;
}

/** Fresh app with the debug flag, then the Lab page of `id` (or the Lab list when `id` is omitted). */
export async function openLab(page: Page, id?: string, o: LabOptions = {}): Promise<void> {
  await freshApp(page);
  await page.goto(`/#${id ? labPath(id, o) : '/lab'}`, { waitUntil: 'domcontentloaded' });
  if (id) await expect(page.getByTestId('lab-stage')).toBeVisible();
  else await expect(page.getByRole('heading', { level: 1, name: 'Games Lab' })).toBeVisible();
}

/** The Outcome panel. */
export function outcomePanel(page: Page) {
  return page.getByTestId('lab-outcome');
}

/** Wait for an outcome and return its result, score and log text. */
export async function readOutcome(page: Page): Promise<{ result: string; score: string; log: string }> {
  const panel = outcomePanel(page);
  await expect(panel.getByTestId('lab-outcome-result')).toHaveText(/^(won|lost|fled)$/);
  return {
    result: (await panel.getByTestId('lab-outcome-result').innerText()).trim(),
    score: (await panel.getByTestId('lab-outcome-score').innerText()).trim(),
    log: (await panel.getByTestId('lab-outcome-log').innerText()).trim(),
  };
}

/**
 * Play the game to its end with the Lab's Bot play button (the engine plays
 * itself headlessly) and return the outcome. Use it for long or real-time
 * games: each e2e test must stay under about 20 s.
 */
export async function botPlayToOutcome(page: Page): Promise<{ result: string; score: string; log: string }> {
  await page.getByRole('button', { name: 'Bot play' }).click();
  await expect(outcomePanel(page).getByText(/^Bot play \(\d+ actions\)$/)).toBeVisible();
  return readOutcome(page);
}

/**
 * Replay the same seed and check that it gives the same outcome: `play` is
 * called twice (before and after "Replay same seed") and must reach an
 * outcome each time, for example by clicking the same controls.
 */
export async function replaySameSeed(page: Page, play: () => Promise<void>): Promise<{ result: string; score: string; log: string }> {
  await play();
  const first = await readOutcome(page);
  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  await play();
  expect(await readOutcome(page)).toEqual(first);
  await expect(page.getByTestId('lab-compare')).toHaveText('Matches the previous run.');
  return first;
}

/**
 * The timing-proof replay check: no input loop at all, only Bot play and explicit waits.
 * 1. Bot play twice: the Lab compares the second outcome with the first and says "Matches the previous run."
 * 2. "Replay same seed" remounts the game (the panel goes back to "No outcome yet"), then Bot play a third time must give the very same outcome.
 * Use it for any game whose real play is long, real-time or hard to repeat identically; `replaySameSeed` keeps driving the real UI.
 */
export async function replaySameSeedWithBot(page: Page): Promise<{ result: string; score: string; log: string }> {
  const first = await botPlayToOutcome(page);
  await page.getByRole('button', { name: 'Bot play' }).click();
  await expect(page.getByTestId('lab-compare')).toHaveText('Matches the previous run.');
  expect(await readOutcome(page)).toEqual(first);

  await page.getByRole('button', { name: 'Replay same seed' }).click();
  await expect(outcomePanel(page)).toContainText('No outcome yet');
  await expect(outcomePanel(page).getByTestId('lab-outcome-result')).toHaveCount(0);
  expect(await botPlayToOutcome(page)).toEqual(first);
  return first;
}

/** No outcome problem was reported by the Lab (an invalid outcome shows in red). */
export async function expectValidOutcome(page: Page): Promise<void> {
  await expect(outcomePanel(page).getByTestId('lab-outcome-problems')).toHaveCount(0);
}

/** No serious or critical axe violation on the current page (same tags as e2e/a11y.spec.ts). */
export async function expectNoSeriousA11yViolations(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(bad, `${where}: ${summary}`).toEqual([]);
}

/** The responsive checks of docs/RESPONSIVE-RULES.md at 320x568 and 844x390: no horizontal overflow, 44px controls in the game. */
export async function expectResponsiveGame(page: Page): Promise<void> {
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    const report = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="lab-stage"]');
      const small = Array.from(stage?.querySelectorAll('button, a, input, select') ?? [])
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
        .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
    });
    expect(report.overflow, `horizontal overflow at ${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    expect(report.small, `controls under 44px at ${size.width}x${size.height}`).toEqual([]);
  }
}

/**
 * Screenshot of the game (the Lab stage only) to `docs/games/img/<id>-<name>.png`,
 * downscaled to 480px wide like e2e/visual.spec.ts. Mobile project only, to keep
 * the images small. At most three per game, 150 KB in total (src/games/registry.test.ts
 * checks it). This is the only screenshot rule for games: never write to e2e/__screenshots__.
 */
export async function shootGame(page: Page, testInfo: TestInfo, id: string, name: string): Promise<void> {
  if (testInfo.project.name !== 'mobile-chromium') return;
  await fontsReady(page);
  const png = await page.getByTestId('lab-stage').screenshot({ scale: 'css', animations: 'disabled' });
  await sharp(png)
    .resize({ width: 480, withoutEnlargement: true })
    .png({ palette: true, quality: 80, colours: 128, effort: 10, compressionLevel: 9 })
    .toFile(`docs/games/img/${id}-${name}.png`);
}

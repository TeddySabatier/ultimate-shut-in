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
  party?: 'full' | 'starter';
  run?: 'plain' | 'buffed';
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
 * the images small; keep each game under 150 KB of images.
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

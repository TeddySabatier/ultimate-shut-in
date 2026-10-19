/**
 * Shared helpers for the e2e suite. Every spec starts from an empty
 * localStorage with the debug flag set so `window.__haven` is installed.
 */
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export interface SaveLike {
  player: { name: string; level: number; xp: number; coins: number; domainPoints: number; ring: number };
  settings: { enabledHabits: string[]; resetHour: number; difficulty: string; benevolence: string };
  board: {
    day: number;
    quests: { instanceId: string; templateId: string; habit: string; kind: string; status: string; count: number }[];
  } | null;
  utilities: Record<'power' | 'water' | 'gas', { value: number }>;
  vassals: Record<string, { level: number; loyalty: number; trust: number }>;
  week: { history: { index: number; result: string; attack: number; defense: number }[] };
  titles: { titleId: string }[];
  stats: { questsTotal: number; questDayStreak: number };
  map: {
    outposts: { id: string; name: string; visits: number; retired: boolean }[];
    visits: { outpostId: string; counted: boolean }[];
    lastSeen: { day: number; domainPoints: number } | null;
  };
  lastOpenDay: number;
  firstPlayDay: number;
}

const FONT_CDN = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const fontRouted = new WeakSet<BrowserContext>();

/**
 * Serve the Google Fonts requests through Playwright's own fetch, bounded to a
 * few seconds. In the browser a slow font CDN keeps its requests in flight for
 * up to 50 s, and Chromium holds the *next navigation* (reload or goto) until
 * they settle: that was the "flaky on load" failure seen in the compose spec
 * and on cold starts with four workers. With the bound, a healthy CDN still
 * delivers the real fonts (screenshots keep the pixel font) and a slow one
 * fails fast instead of stalling the suite.
 */
async function routeFonts(context: BrowserContext): Promise<void> {
  if (fontRouted.has(context)) return;
  fontRouted.add(context);
  await context.route(FONT_CDN, async (route) => {
    try {
      const response = await route.fetch({ timeout: 5_000 });
      await route.fulfill({ response });
    } catch {
      await route.abort().catch(() => undefined);
    }
  });
}

/**
 * Fresh app: debug hook on, storage empty, at the onboarding screen.
 *
 * Navigation waits for the DOM and the app's first heading rather than the
 * window `load` event (which waits on the fonts), and the font CDN is routed
 * through a bounded fetch (see `routeFonts`). Before the reload the service
 * worker gets a moment to finish installing: a worker still installing from
 * the first navigation is "external" to the reloaded page and Workbox
 * (autoUpdate) would reload the page by itself when it activates.
 */
export async function freshApp(page: Page): Promise<void> {
  await routeFonts(page.context());
  await page.addInitScript(() => {
    try {
      localStorage.setItem('haven.debug', '1');
    } catch {
      /* private mode */
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeVisible();
  await page
    .waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return true;
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg && !reg.installing && !reg.waiting && !!reg.active;
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined); // no registration (blocked service workers): nothing to wait for
  await page.evaluate(() => {
    const debug = localStorage.getItem('haven.debug');
    localStorage.clear();
    if (debug) localStorage.setItem('haven.debug', debug);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Protocol online' })).toBeVisible();
}

/**
 * Resolve once the web fonts are in, so screenshots and metrics are stable. The
 * font stylesheet loads without blocking (index.html), so first wait for its
 * faces to appear, then for them to settle; bounded, because fonts are
 * decoration and an unreachable CDN must not fail the suite.
 */
export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hasPixelFace = () => {
      let found = false;
      document.fonts.forEach((f) => {
        if (/press start/i.test(f.family)) found = true;
      });
      return found;
    };
    const settled = (async () => {
      while (!hasPixelFace()) await new Promise((r) => setTimeout(r, 50));
      await document.fonts.ready;
    })();
    return Promise.race([settled, new Promise<void>((r) => setTimeout(r, 6_000))]);
  });
}

export interface OnboardOptions {
  name?: string;
  pace?: 'Gentle' | 'Steady' | 'Hardcore';
  /** Habit labels to leave enabled (others get unticked). */
  habits?: string[];
}

export const ALL_HABITS = ['Move', 'Outside', 'Clean', 'Social', 'Study', 'Sleep', 'Eat', 'Hygiene'] as const;

/** Walk the three onboarding steps and land on Home. */
export async function onboard(page: Page, opts: OnboardOptions = {}): Promise<void> {
  const name = opts.name ?? 'Tester';
  await skipOpening(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Register the Absolute' })).toBeVisible();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Assign the vassals' })).toBeVisible();
  if (opts.habits) {
    for (const h of ALL_HABITS) {
      const box = page.getByRole('checkbox', { name: h, exact: true });
      const want = opts.habits.includes(h);
      if ((await box.isChecked()) !== want) await box.click();
    }
  }
  await page.getByRole('radio', { name: opts.pace ?? 'Steady', exact: true }).check();
  await page.getByRole('button', { name: 'Open the Haven' }).click();
  await expect(page.getByTestId('ring-header')).toBeVisible();
  await settleOverlays(page);
}

/** Skip the typewriter if it is still running (it finishes on its own in ~11 s). */
export async function skipOpening(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible()) await skip.click({ timeout: 3_000 }).catch(() => undefined);
  await expect(skip).toBeHidden();
}

export async function getNowOffset(page: Page): Promise<number> {
  return page.evaluate(() => window.__haven?.getNowOffsetMs() ?? 0);
}

/** Re-apply an exact offset (after a reload, which loses the in-memory clock shift). */
export async function setNowOffset(page: Page, ms: number): Promise<void> {
  await page.evaluate((v) => window.__haven?.setNowOffsetMs(v), ms);
}

export type Tab = 'Haven' | 'Board' | 'Map' | 'Ledger' | 'Settings';

export async function gotoTab(page: Page, tab: Tab): Promise<void> {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: tab, exact: true }).click();
  if (tab === 'Haven') {
    await expect(page.getByTestId('ring-header')).toBeVisible();
    return;
  }
  const heading = { Board: "Today's board", Map: 'City map', Ledger: 'The Ledger', Settings: 'Settings' }[tab];
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}

export async function getSave(page: Page): Promise<SaveLike> {
  const save = await page.evaluate(() => window.__haven?.getSave() ?? null);
  if (!save) throw new Error('no save in the store');
  return save as unknown as SaveLike;
}

/**
 * Move the app clock to noon, `days` game days after the real today.
 * Noon keeps the simulated instant away from the 04:00 boundary and
 * from DST change-overs. Boundaries are processed by the hook's tick.
 */
export async function advanceToDay(page: Page, days: number): Promise<void> {
  await page.evaluate(
    ({ days, DAY_MS, HOUR_MS }) => {
      const api = window.__haven;
      if (!api) throw new Error('debug hook missing');
      const real = new Date();
      const timeOfDay = real.getHours() * HOUR_MS + real.getMinutes() * 60_000 + real.getSeconds() * 1000 + real.getMilliseconds();
      api.setNowOffsetMs(days === 0 ? 0 : days * DAY_MS - timeOfDay + 12 * HOUR_MS);
    },
    { days, DAY_MS, HOUR_MS },
  );
}

export interface OverlayTally {
  levelUps: number;
  waves: number;
  rings: number;
  toasts: number;
}

function emptyTally(): OverlayTally {
  return { levelUps: 0, waves: 0, rings: 0, toasts: 0 };
}

async function visible(l: Locator): Promise<boolean> {
  return l.isVisible().catch(() => false);
}

/**
 * Dismiss whatever overlay is showing until the queue is empty. Returns
 * what was seen so specs can assert on level-ups or wave windows. With
 * `keepWave`, stops as soon as a wave window is up (left open).
 */
export async function settleOverlays(page: Page, opts: { keepWave?: boolean } = {}): Promise<OverlayTally> {
  const tally = emptyTally();
  for (let i = 0; i < 60; i++) {
    // Native <dialog> without [open] is not an overlay. MapSheet (CITY-MAP 5.2)
    // keeps closed dialogs in the tree with display:flex, so role=dialog matches them.
    const dialog = page.locator('dialog[open], [role="dialog"]:not(dialog)').first();
    const toastClose = page.getByRole('button', { name: 'Dismiss' }).first();
    if (await visible(dialog)) {
      const titleId = (await dialog.getAttribute('aria-labelledby')) ?? '';
      const text = titleId ? await page.locator(`[id="${titleId}"]`).innerText().catch(() => '') : '';
      if (/level up/i.test(text)) tally.levelUps++;
      else if (/^wave/i.test(text)) {
        tally.waves++;
        if (opts.keepWave) return tally;
      } else if (/domain expanded/i.test(text)) tally.rings++;
      const skip = dialog.getByRole('button', { name: 'Skip' });
      if (await visible(skip)) await skip.click();
      await dialog.getByRole('button', { name: 'Continue' }).click();
      continue;
    }
    if (await visible(toastClose)) {
      tally.toasts++;
      await toastClose.click();
      continue;
    }
    await page.waitForTimeout(100);
    if (!(await visible(dialog)) && !(await visible(toastClose))) break;
  }
  return tally;
}

export function openCards(page: Page): Locator {
  return page.locator('article[data-status="open"]');
}

/** A quest card pinned by its title, so it keeps matching after its status changes. */
export function cardByTitle(page: Page, title: string): Locator {
  return page.locator('article').filter({ has: page.getByRole('heading', { level: 3, name: title, exact: true }) });
}

/** Title of the first card matching `locator`, plus a locator pinned to that card. */
export async function pinCard(page: Page, locator: Locator): Promise<{ title: string; card: Locator }> {
  // textContent, not innerText: the heading is uppercased by CSS while the accessible name keeps the source casing.
  const title = ((await locator.first().getByRole('heading', { level: 3 }).textContent()) ?? '').trim();
  return { title, card: cardByTitle(page, title) };
}

/** Complete every unsettled quest on the Board via its Done button (dismissing overlays). */
export async function completeAllQuests(page: Page): Promise<OverlayTally> {
  await gotoTab(page, 'Board');
  const tally = emptyTally();
  for (let i = 0; i < 12; i++) {
    const card = page.locator('article[data-status="open"], article[data-status="tried"]').first();
    if (!(await visible(card))) break;
    await card.getByRole('button', { name: 'Done' }).click();
    const t = await settleOverlays(page);
    tally.levelUps += t.levelUps;
    tally.waves += t.waves;
    tally.rings += t.rings;
    tally.toasts += t.toasts;
  }
  return tally;
}

/**
 * Advance days until the Board shows an open quest of `kind`; returns its
 * card. Boards are seeded per day, so a few days are usually enough.
 */
export async function findQuestOfKind(
  page: Page,
  kind: 'check' | 'timer' | 'count',
  startDay = 0,
): Promise<{ card: Locator; day: number }> {
  for (let day = startDay; day < startDay + 14; day++) {
    if (day > 0) {
      await advanceToDay(page, day);
      await settleOverlays(page);
    }
    await gotoTab(page, 'Board');
    const open = page.locator(`article[data-kind="${kind}"][data-status="open"]`).first();
    if (await visible(open)) return { card: (await pinCard(page, open)).card, day };
  }
  throw new Error(`no open ${kind} quest within 14 days`);
}

/** Numbers shown in the ring header (level, coins). */
export async function headerStats(page: Page): Promise<{ level: number; coins: number }> {
  const header = page.getByTestId('ring-header');
  const level = Number((await header.getByText(/^Lv \d+$/).innerText()).replace(/\D/g, ''));
  const coins = Number((await header.locator('[aria-label$="settlement"] .mono').innerText()).replace(/\D/g, ''));
  return { level, coins };
}

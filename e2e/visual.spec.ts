/**
 * Documentation screenshots of every screen and the main overlays, saved under
 * e2e/__screenshots__/<project>-<name>.png. These are not strict snapshot
 * assertions: boards are seeded per day and the opening animates, so the files
 * are reviewed by eye (see docs/review/qa-report.md).
 *
 * The folder is committed, so each file is kept small: a CSS-pixel capture (no
 * device-scale duplicate), scaled down to MAX_WIDTH and written as a quantised
 * PNG. One file per shot: the viewport capture. A `-full` file (the whole
 * scrolling screen) is written only for the projects in FULL_PROJECTS and only
 * when the screen is taller than the viewport, so no two files differ by height
 * alone. scripts/screenshots-dedupe.mjs prunes what no shot writes any more;
 * keep the shoot(page, p, 'NN-name') calls literal so it can read them.
 */
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { advanceToDay, completeAllQuests, fontsReady, freshApp, gotoTab, openCards, pinCard, settleOverlays } from './helpers';

const DIR = 'e2e/__screenshots__';
const MAX_WIDTH = 480;
const FULL_PROJECTS = ['mobile-chromium'];

/** Downscale to MAX_WIDTH (never enlarge) and write a palette PNG. */
async function save(png: Buffer, path: string) {
  await sharp(png)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png({ palette: true, quality: 80, colours: 128, effort: 10, compressionLevel: 9 })
    .toFile(path);
}

async function shoot(page: Page, project: string, name: string, opts: { full?: boolean } = {}) {
  await fontsReady(page);
  await page.waitForTimeout(250);
  await save(await page.screenshot({ scale: 'css' }), `${DIR}/${project}-${name}.png`);
  if (opts.full && FULL_PROJECTS.includes(project)) {
    const viewportHeight = page.viewportSize()?.height ?? 0;
    // The shell scrolls inside <main>; let the document grow so the whole screen is captured.
    const style = await page.addStyleTag({
      content: '[class*="shell"]{height:auto!important;min-height:100dvh!important;overflow:visible!important}main#main{overflow:visible!important}',
    });
    const full = await page.screenshot({ fullPage: true, scale: 'css' });
    await style.evaluate((el) => el.remove());
    if (((await sharp(full).metadata()).height ?? 0) > viewportHeight * 1.05) {
      await save(full, `${DIR}/${project}-${name}-full.png`);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('screens and overlays', async ({ page }, testInfo) => {
  test.setTimeout(120_000); // a week of play, every screen, the overlays and the Map
  const p = testInfo.project.name;

  await shoot(page, p, '01-onboarding-opening');
  await page.getByRole('button', { name: 'Skip' }).click();
  await shoot(page, p, '02-onboarding-opening-skipped');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Name').fill('Tester');
  await shoot(page, p, '03-onboarding-name');
  await page.getByRole('button', { name: 'Continue' }).click();
  await shoot(page, p, '04-onboarding-habits', { full: true });
  await page.getByRole('button', { name: 'Open the Haven' }).click();
  await expect(page.getByTestId('ring-header')).toBeVisible();
  await settleOverlays(page);
  await shoot(page, p, '05-home', { full: true });

  await gotoTab(page, 'Board');
  await shoot(page, p, '06-board', { full: true });

  // One settlement toast, then the board with a settled card.
  const { card: firstCard } = await pinCard(page, openCards(page));
  await firstCard.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await shoot(page, p, '07-board-toast');
  await settleOverlays(page);
  await shoot(page, p, '08-board-settled-card', { full: true });

  await gotoTab(page, 'Ledger');
  await page.getByRole('button', { name: /Pell the Runner/ }).click();
  await shoot(page, p, '09-ledger', { full: true });

  await gotoTab(page, 'Settings');
  await shoot(page, p, '10-settings', { full: true });
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await expect(page.getByRole('dialog', { name: 'Reset everything?' })).toBeVisible();
  await shoot(page, p, '11-settings-reset-dialog');
  await page.getByRole('dialog', { name: 'Reset everything?' }).getByRole('button', { name: 'Cancel' }).click();

  // Level-up window: finishing the first board is usually enough XP.
  await completeAllQuestsUntilLevelUp(page, p);

  // Wave window: play a few days, then jump past the 7th boundary.
  for (let day = 1; day <= 3; day++) {
    await advanceToDay(page, day);
    await settleOverlays(page);
    await completeAllQuests(page);
  }
  await advanceToDay(page, 7);
  const tally = await settleOverlays(page, { keepWave: true });
  expect(tally.waves).toBe(1);
  const dialog = page.getByRole('dialog');
  const skip = dialog.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(dialog.getByRole('list', { name: 'Battle log' }).getByRole('listitem').first()).toBeVisible();
  await shoot(page, p, '13-wave-result');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await settleOverlays(page);
  await gotoTab(page, 'Haven');
  await shoot(page, p, '14-home-after-week', { full: true });
  await gotoTab(page, 'Ledger');
  await page.getByRole('button', { name: /^Wave 1 · / }).click();
  await shoot(page, p, '15-ledger-wave-log', { full: true });

  // The City Map after a week: residue on the wall, an outpost with a visit, its sheet, a zone, the compare and the list.
  await gotoTab(page, 'Map');
  await page.getByRole('button', { name: 'Mark an outpost' }).click();
  const form = page.getByRole('dialog', { name: 'Mark a place' });
  await form.getByLabel('Name').fill('Riverside Gym');
  await shoot(page, p, '16-map-form');
  await form.getByRole('button', { name: 'Mark outpost' }).click();
  await expect(form).toBeHidden();
  await settleOverlays(page);
  await page.getByRole('button', { name: 'I was there: log a visit to Riverside Gym' }).click();
  await settleOverlays(page);
  await shoot(page, p, '17-map', { full: true });
  await page.getByRole('button', { name: /^Riverside Gym, Marked/ }).click();
  await expect(page.getByRole('dialog', { name: 'Riverside Gym' })).toBeVisible();
  await shoot(page, p, '18-map-pin');
  await page.keyboard.press('Escape');
  // Zone bands are keyboard targets (taps go to the tiles underneath): focus one and press Enter.
  await page.getByRole('button', { name: /^Zone 2,/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'The Flat' })).toBeVisible();
  await shoot(page, p, '19-map-zone');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Compare with 7 days ago' }).click();
  await shoot(page, p, '20-map-compare');
  await page.getByRole('button', { name: 'Show the map as a list' }).click();
  await shoot(page, p, '21-map-list', { full: true });
});

async function completeAllQuestsUntilLevelUp(page: Page, project: string): Promise<void> {
  await gotoTab(page, 'Board');
  for (let i = 0; i < 6; i++) {
    const card = page.locator('article[data-status="open"], article[data-status="tried"]').first();
    if (!(await card.isVisible().catch(() => false))) return;
    await card.getByRole('button', { name: 'Done' }).click();
    const levelUp = page.getByRole('dialog').filter({ hasText: 'Level up' });
    // Toasts come first; wait briefly for the queue to reach a level-up window.
    for (let j = 0; j < 6; j++) {
      if (await levelUp.isVisible().catch(() => false)) {
        await shoot(page, project, '12-level-up');
        await settleOverlays(page);
        return;
      }
      const close = page.getByRole('button', { name: 'Dismiss' }).first();
      if (await close.isVisible().catch(() => false)) await close.click();
      else await page.waitForTimeout(100);
    }
    await settleOverlays(page);
  }
}

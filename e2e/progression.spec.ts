import { expect, test, type Page } from '@playwright/test';
import { advanceToDay, completeAllQuests, freshApp, getSave, gotoTab, onboard, settleOverlays } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await onboard(page, { name: 'Tester', pace: 'Steady' });
});

test('eight full days: wave window after the 7th boundary, DP rises, a level-up appears', async ({ page }) => {
  let levelUps = 0;
  let waveSeen = false;
  const dp0 = (await getSave(page)).player.domainPoints;

  for (let day = 0; day <= 8; day++) {
    if (day > 0) {
      await advanceToDay(page, day);
      const tally = await settleOverlays(page, { keepWave: true });
      levelUps += tally.levelUps;
      if (day === 7) {
        // Boundary 6 -> 7 closes the first wave period.
        expect(tally.waves).toBe(1);
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(/^Wave 1 · The Room$/)).toBeVisible();
        await expect(dialog.getByRole('progressbar', { name: 'Attack' })).toBeVisible();
        await expect(dialog.getByRole('progressbar', { name: 'Defense' })).toBeVisible();
        const attack = Number(await dialog.getByRole('progressbar', { name: 'Attack' }).getAttribute('aria-valuenow'));
        const defense = Number(await dialog.getByRole('progressbar', { name: 'Defense' }).getAttribute('aria-valuenow'));
        expect(attack).toBeGreaterThan(0);
        expect(defense).toBeGreaterThan(0);
        const skip = dialog.getByRole('button', { name: 'Skip' });
        if (await skip.isVisible().catch(() => false)) await skip.click();
        const log = dialog.getByRole('list', { name: 'Battle log' });
        await expect(log.getByRole('listitem').first()).toBeVisible();
        expect(await log.getByRole('listitem').count()).toBeGreaterThanOrEqual(3);
        await expect(dialog.getByText(/Wave repelled|Decisive|Held/).first()).toBeVisible();
        await dialog.getByRole('button', { name: 'Continue' }).click();
        await expect(dialog).toBeHidden();
        const save = await getSave(page);
        expect(save.week.history).toHaveLength(1);
        expect(save.week.history[0]?.attack).toBe(attack);
        expect(save.week.history[0]?.defense).toBe(defense);
        expect(save.player.domainPoints).toBeGreaterThan(dp0);
        waveSeen = true;
        const rest = await settleOverlays(page);
        levelUps += rest.levelUps;
      } else {
        expect(tally.waves).toBe(0);
      }
    }
    const t = await completeAllQuests(page);
    levelUps += t.levelUps;
    await expect(page.getByRole('heading', { name: 'All settled' })).toBeVisible();
  }

  expect(waveSeen).toBe(true);
  expect(levelUps).toBeGreaterThan(0);
  const final = await getSave(page);
  expect(final.player.level).toBeGreaterThan(1);
  expect(final.player.domainPoints).toBeGreaterThan(dp0);
  // The Ledger lists the fought wave with its log.
  await gotoTab(page, 'Ledger');
  await page.getByRole('button', { name: /^Wave 1 · / }).click();
  await expect(page.getByRole('button', { name: /^Wave 1 · / })).toHaveAttribute('aria-expanded', 'true');
});

const TIED: Record<string, 'Power' | 'Water' | 'Gas'> = { Sleep: 'Power', Hygiene: 'Water', Eat: 'Gas' };
const UTILITY_KEY = { Power: 'power', Water: 'water', Gas: 'gas' } as const;

async function utilityRow(page: Page, label: 'Power' | 'Water' | 'Gas') {
  const row = page.locator('li[data-state]').filter({ hasText: label });
  const state = await row.getAttribute('data-state');
  const value = Number(await row.getByRole('progressbar', { name: label }).getAttribute('aria-valuenow'));
  const stateLabel = (await row.locator('.muted').innerText()).trim();
  return { state, value, stateLabel };
}

test('utilities drop when sleep/hygiene/eat quests are neglected and recover when one is done', async ({ page }) => {
  await gotoTab(page, 'Haven');
  for (const u of ['Power', 'Water', 'Gas'] as const) {
    const row = await utilityRow(page, u);
    expect(row.value).toBe(100);
    expect(row.state).toBe('bright');
    expect(row.stateLabel).toBe('Bright');
  }

  // Three boundaries without a care quest: 100 -> 55 on Steady (15 a day).
  await advanceToDay(page, 3);
  await settleOverlays(page);
  await gotoTab(page, 'Haven');
  for (const u of ['Power', 'Water', 'Gas'] as const) {
    const row = await utilityRow(page, u);
    expect(row.value).toBeLessThan(100);
    expect(row.value).toBe(55);
    expect(row.state).toBe('flickering');
    expect(row.stateLabel).toBe('Flickering');
  }

  // Find a care quest and settle it: its utility goes back up.
  let found: { habit: string; utility: 'Power' | 'Water' | 'Gas' } | null = null;
  for (let day = 3; day < 14 && !found; day++) {
    if (day > 3) {
      await advanceToDay(page, day);
      await settleOverlays(page);
    }
    await gotoTab(page, 'Board');
    for (const habit of Object.keys(TIED)) {
      const card = page.locator(`article[data-status="open"]`).filter({ has: page.locator(`header [role="img"][aria-label="${habit}"]`) }).first();
      if (await card.isVisible().catch(() => false)) {
        const utility = TIED[habit] as 'Power' | 'Water' | 'Gas';
        const before = (await getSave(page)).utilities[UTILITY_KEY[utility]].value;
        await card.getByRole('button', { name: 'Done' }).click();
        await settleOverlays(page);
        const after = (await getSave(page)).utilities[UTILITY_KEY[utility]].value;
        expect(after).toBeGreaterThan(before);
        expect(after - before).toBeLessThanOrEqual(40);
        await gotoTab(page, 'Haven');
        const row = await utilityRow(page, utility);
        expect(row.value).toBe(after);
        found = { habit, utility };
        break;
      }
    }
  }
  expect(found).not.toBeNull();
});

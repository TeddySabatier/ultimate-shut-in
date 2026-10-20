/**
 * Arena loop: Armory, a run through the host, lottery, homecoming, bank, request.
 * Dev-only games (Coin Duel) appear because helpers set `haven.debug`.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeAllQuests, freshApp, gotoTab, headerStats, onboard, settleOverlays } from './helpers';

async function openArena(page: Page): Promise<void> {
  await gotoTab(page, 'Haven');
  await page.getByTestId('arena-card').getByRole('link', { name: 'Go' }).click();
  await expect(page.getByTestId('arena-screen')).toBeVisible();
}

async function earnCoins(page: Page, min: number): Promise<void> {
  await gotoTab(page, 'Haven');
  for (let day = 0; day < 8; day++) {
    if ((await headerStats(page)).coins >= min) return;
    await completeAllQuests(page);
    await settleOverlays(page);
    await gotoTab(page, 'Haven');
    if ((await headerStats(page)).coins >= min) return;
    await page.evaluate(
      ({ day, DAY_MS, HOUR_MS }) => {
        const api = window.__haven;
        if (!api) throw new Error('debug hook missing');
        const real = new Date();
        const timeOfDay = real.getHours() * HOUR_MS + real.getMinutes() * 60_000 + real.getSeconds() * 1000 + real.getMilliseconds();
        api.setNowOffsetMs((day + 1) * DAY_MS - timeOfDay + 12 * HOUR_MS);
      },
      { day, DAY_MS: 86_400_000, HOUR_MS: 3_600_000 },
    );
    await settleOverlays(page);
    await gotoTab(page, 'Haven');
  }
  expect((await headerStats(page)).coins, 'enough settlement for the Arena loop').toBeGreaterThanOrEqual(min);
}

async function playCoinDuel(page: Page): Promise<void> {
  const stage = page.getByTestId('arena-stage');
  await expect(stage.getByRole('heading', { name: 'Coin Duel' })).toBeVisible();
  const allies = stage.getByRole('button', { name: /^Send / });
  for (let i = 0; i < 6; i++) {
    if ((await allies.count()) === 0) break;
    await allies.first().click();
  }
}

async function axeCheck(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(bad, `${where}: ${summary}`).toEqual([]);
}

test('buy gear, run the yard, lottery, homecoming, bank and ask for a game', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await freshApp(page);
  await onboard(page);
  await earnCoins(page, 180);
  await openArena(page);
  await settleOverlays(page);

  await page.getByTestId('buy-practice-blade').first().click();
  await settleOverlays(page);
  const saveAfterBuy = await page.evaluate(() => window.__haven?.getSave());
  expect(saveAfterBuy?.arena?.gear?.move?.[0] ?? saveAfterBuy?.arena?.gear?.outside?.[0] ?? true).toBeTruthy();

  await page.getByTestId('arena-enter').click();
  await settleOverlays(page);
  await playCoinDuel(page);

  const lottery = page.getByTestId('arena-lottery');
  const homecoming = page.getByTestId('arena-homecoming');
  await expect(lottery.or(homecoming)).toBeVisible();

  if (await lottery.isVisible().catch(() => false)) {
    await lottery.getByRole('button').first().click();
    await settleOverlays(page);
    await expect(page.getByTestId('arena-bank')).toBeVisible();
    await page.getByTestId('arena-continue').click();
    await expect(page.getByTestId('arena-host')).toBeVisible();
    await page.getByTestId('arena-stage').getByRole('button', { name: 'Forfeit' }).click();
    await expect(page.getByTestId('arena-homecoming')).toBeVisible();
    const afterLoss = await page.evaluate(() => window.__haven?.getSave());
    const gear = afterLoss?.arena?.gear as Record<string, (string | null)[]> | undefined;
    const hasBlade = gear && Object.values(gear).some((slots) => slots[0] === 'practice-blade');
    expect(hasBlade, 'Armory gear kept after homecoming').toBe(true);
    expect(afterLoss?.arena?.activeRun ?? null).toBeNull();
    await page.getByRole('button', { name: 'Back to the Arena' }).click();
  } else {
    await page.getByRole('button', { name: 'Back to the Arena' }).click();
  }

  if ((await headerStats(page)).coins < 40) await earnCoins(page, 80);
  await openArena(page);
  await page.getByTestId('arena-enter').click();
  await settleOverlays(page);
  await playCoinDuel(page);
  if (await lottery.isVisible().catch(() => false)) {
    await lottery.getByRole('button').first().click();
    await settleOverlays(page);
    await page.getByTestId('arena-bank-coins').click();
    await settleOverlays(page);
  } else if (await homecoming.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Back to the Arena' }).click();
  }

  await expect(page.getByTestId('arena-request')).toBeVisible();
  await page.getByPlaceholder('A quiet puzzle about watering plants…').fill('A slow garden puzzle about watering plants.');
  await page.getByTestId('arena-request-send').click();
  await settleOverlays(page);
  await expect(page.getByText('Logged. The engineers are reading.')).toBeVisible();
  const afterReq = await page.evaluate(() => window.__haven?.getSave());
  expect(afterReq?.arena?.requests?.length ?? 0).toBeGreaterThan(0);

  test.skip(testInfo.project.name !== 'mobile-chromium', 'axe runs on the mobile project');
  await axeCheck(page, 'arena');
});

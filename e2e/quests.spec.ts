import { expect, test, type Page } from '@playwright/test';
import { advanceToDay, findQuestOfKind, freshApp, getNowOffset, getSave, gotoTab, headerStats, onboard, openCards, pinCard, setNowOffset, settleOverlays } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
  await onboard(page, { name: 'Tester' });
});

/**
 * The parts of a save that an undo must restore exactly (GDD 6.7: XP, coins,
 * DP, vassal XP and loyalty, utilities). Trust and `lastActiveDay` are not in
 * the snapshot: the attempt still counts, as it does for "Tried".
 */
async function snapshot(page: Page) {
  const s = await getSave(page);
  const vassals = Object.fromEntries(
    Object.entries(s.vassals).map(([k, v]) => {
      const { trust: _trust, lastActiveDay: _last, ...rest } = v as Record<string, unknown>;
      return [k, rest];
    }),
  );
  return {
    player: s.player,
    utilities: s.utilities,
    vassals,
    board: s.board?.quests.map((q) => ({ id: q.instanceId, status: q.status, count: q.count })),
  };
}

test('check quest: Done shows a settlement toast, moves XP and coins, Undo restores exactly', async ({ page }) => {
  const { card } = await findQuestOfKind(page, 'check');
  const before = await snapshot(page);
  await gotoTab(page, 'Haven');
  const headerBefore = await headerStats(page);
  await gotoTab(page, 'Board');

  await card.getByRole('button', { name: 'Done' }).click();

  const toast = page.getByRole('status');
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('heading', { name: 'Settlement' })).toBeVisible();
  const rewards = toast.getByRole('list', { name: 'Rewards' });
  await expect(rewards).toBeVisible();
  await expect(rewards.getByText('XP').first()).toBeVisible();
  await expect(card).toHaveAttribute('data-status', 'done');
  await expect(card.getByText('Settled', { exact: true })).toBeVisible();

  const after = await getSave(page);
  expect(after.player.coins).toBeGreaterThan(before.player.coins);
  expect(after.player.xp + (after.player.level - before.player.level) * 1000).toBeGreaterThan(before.player.xp);

  await settleOverlays(page);
  await gotoTab(page, 'Haven');
  const headerAfter = await headerStats(page);
  expect(headerAfter.coins).toBeGreaterThan(headerBefore.coins);

  await gotoTab(page, 'Board');
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').getByRole('heading', { name: 'Reverted' })).toBeVisible();
  await settleOverlays(page);
  await expect(card).toHaveAttribute('data-status', 'open');
  expect(await snapshot(page)).toEqual(before);
  const undone = await getSave(page);
  const habit = undone.board?.quests.find((q) => q.status === 'open' && q.kind === 'check')?.habit ?? '';
  expect(undone.vassals[habit]?.trust).toBe(1);
  expect(undone.stats.questsTotal).toBe(0);
  await gotoTab(page, 'Haven');
  expect(await headerStats(page)).toEqual(headerBefore);
});

test('timer quest: start/stop ticks mm:ss and a running timer survives reload', async ({ page }) => {
  const { card } = await findQuestOfKind(page, 'timer');
  const offset = await getNowOffset(page);
  const clock = card.getByLabel('Elapsed');
  await expect(clock).toHaveText('00:00');
  await card.getByRole('button', { name: 'Start timer' }).click();
  await expect(card.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(clock).toHaveText(/^00:0[1-9]$/, { timeout: 5_000 });
  await page.waitForTimeout(1100);
  const shown = await clock.innerText();
  expect(shown).toMatch(/^\d\d:\d\d$/);
  expect(shown).not.toBe('00:00');

  await page.reload();
  // The clock shift lives in memory: put the exact same offset back so the timer keeps counting from where it was.
  if (offset !== 0) await setNowOffset(page, offset);
  await gotoTab(page, 'Board');
  const again = card;
  await expect(again.getByRole('button', { name: 'Stop' })).toBeVisible();
  // The live clock re-renders once a second; wait for the first tick after mount.
  await expect(again.getByLabel('Elapsed')).not.toHaveText('00:00');
  const afterReload = await again.getByLabel('Elapsed').innerText();
  expect(afterReload >= shown).toBe(true);

  await again.getByRole('button', { name: 'Stop' }).click();
  await expect(again.getByRole('button', { name: 'Resume' })).toBeVisible();
  const paused = await again.getByLabel('Elapsed').innerText();
  await page.waitForTimeout(1500);
  await expect(again.getByLabel('Elapsed')).toHaveText(paused);
});

test('count quest: the stepper counts up and settles the quest at the target', async ({ page }) => {
  const { card } = await findQuestOfKind(page, 'count');
  const counter = card.getByRole('group', { name: 'Count' });
  const text = await counter.locator('.mono').innerText();
  const m = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!m) throw new Error(`unreadable counter: ${text}`);
  const target = Number(m[2]);
  expect(target).toBeGreaterThan(0);
  await expect(counter.getByRole('button', { name: 'Decrease count' })).toBeDisabled();
  for (let i = 0; i < target - 1; i++) await counter.getByRole('button', { name: 'Increase count' }).click();
  await expect(counter.locator('.mono')).toHaveText(new RegExp(`^${target - 1}\\s*/\\s*${target}$`));
  await expect(counter.getByRole('button', { name: 'Decrease count' })).toBeEnabled();
  await expect(card.getByRole('button', { name: 'Done' })).toBeVisible();
  // Reaching the target settles the quest by itself (GDD 6.6); Done is the shortcut for an honour-system finish.
  await counter.getByRole('button', { name: 'Increase count' }).click();
  await expect(card).toHaveAttribute('data-status', 'done');
  expect((await getSave(page)).board?.quests.find((q) => q.kind === 'count' && q.status === 'done')?.count).toBe(target);
  await expect(page.getByRole('status').getByRole('heading', { name: 'Settlement' })).toBeVisible();
});

test('"I tried" marks a quest as attempted', async ({ page }) => {
  await gotoTab(page, 'Board');
  const { card } = await pinCard(page, openCards(page));
  await card.getByRole('button', { name: 'I tried' }).click();
  await expect(page.getByRole('status').getByRole('heading', { name: 'Attempt logged' })).toBeVisible();
  await expect(card).toHaveAttribute('data-status', 'tried');
  await expect(card.getByText('Attempted', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'I tried' })).toBeHidden();
  // Still completable.
  await expect(card.getByRole('button', { name: 'Done' })).toBeVisible();
});

test('reroll once, then the swap control is gone for the day', async ({ page }) => {
  await gotoTab(page, 'Board');
  // Earn the swap price first (new saves start at 0 settlement), keeping one quest open.
  for (let i = 0; i < 8; i++) {
    const save = await getSave(page);
    const open = openCards(page);
    if (save.player.coins >= 15 && (await open.count()) >= 1) break;
    if ((await open.count()) <= 1) {
      await advanceToDay(page, i + 1);
      await settleOverlays(page);
      await gotoTab(page, 'Board');
      continue;
    }
    await open.first().getByRole('button', { name: 'Done' }).click();
    await settleOverlays(page);
  }
  const swap = page.getByRole('button', { name: /^Swap quest \(\d+\)$/ });
  await expect(swap.first()).toBeVisible();
  const { card, title: titleBefore } = await pinCard(page, openCards(page));
  const coinsBefore = (await getSave(page)).player.coins;
  await card.getByRole('button', { name: /^Swap quest/ }).click();
  await expect(page.getByRole('status').getByRole('heading', { name: 'Quest swapped' })).toBeVisible();
  await settleOverlays(page);
  await expect(page.getByText('One quest was swapped today.')).toBeVisible();
  await expect(swap).toHaveCount(0);
  const after = await getSave(page);
  expect(after.player.coins).toBe(coinsBefore - 15);
  const titles = (await page.locator('article h3').allTextContents()).map((t) => t.trim());
  expect(titles).not.toContain(titleBefore);
});

test("disabling a habit keeps its quests off tomorrow's board", async ({ page }) => {
  await gotoTab(page, 'Board');
  const first = openCards(page).first();
  const habitLabel = await first.locator('header [role="img"]').first().getAttribute('aria-label');
  if (!habitLabel) throw new Error('card has no habit icon label');

  await gotoTab(page, 'Settings');
  const box = page.getByRole('checkbox', { name: habitLabel, exact: true });
  await expect(box).toBeChecked();
  await box.click();
  await expect(box).not.toBeChecked();

  await advanceToDay(page, 1);
  await settleOverlays(page);
  await gotoTab(page, 'Board');
  await expect(page.locator('article[data-kind]').first()).toBeVisible();
  await expect(page.locator(`article header [role="img"][aria-label="${habitLabel}"]`)).toHaveCount(0);
  const save = await getSave(page);
  const habitId = habitLabel.toLowerCase();
  expect(save.settings.enabledHabits).not.toContain(habitId);
  expect(save.board?.quests.some((q) => q.habit === habitId)).toBe(false);
  // The vassal strip on Home hides them too.
  await gotoTab(page, 'Haven');
  await expect(page.getByRole('list', { name: 'Vassals' }).getByRole('listitem')).toHaveCount(7);
});

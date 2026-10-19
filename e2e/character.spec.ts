import { expect, test } from '@playwright/test';
import { ALL_HABITS, freshApp, getSave, gotoTab, onboard } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('Ledger lists the enabled vassals; expanding one shows trust dots and loyalty', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Ledger');
  const vassalRows = page.getByRole('button', { expanded: false }).filter({ hasText: /· L1 · Loyalty 50/ });
  await expect(vassalRows).toHaveCount(8);

  const pell = page.getByRole('button', { name: /Pell the Runner/ });
  await pell.click();
  await expect(pell).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('img', { name: 'Trust 0 of 7' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Pell loyalty' })).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByRole('progressbar', { name: 'Pell XP' })).toBeVisible();
  await expect(page.getByText('Lifetime quests')).toBeVisible();
  await pell.click();
  await expect(pell).toHaveAttribute('aria-expanded', 'false');
});

test('Ledger shows only the vassals whose habit is enabled', async ({ page }) => {
  await onboard(page, { name: 'Tester', habits: ['Move', 'Sleep', 'Eat'] });
  const save = await getSave(page);
  expect(save.settings.enabledHabits.sort()).toEqual(['eat', 'move', 'sleep']);
  await gotoTab(page, 'Ledger');
  await expect(page.getByRole('button', { name: /Pell the Runner/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lunel/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Basil/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Wren/ })).toHaveCount(0);
  expect(ALL_HABITS.length).toBe(8);
});

test('titles list shows locked conditions', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Ledger');
  await expect(page.getByRole('heading', { name: /^Titles \(0\/\d+\)$/ })).toBeVisible();
  await expect(page.getByText(/^Settle \d+ quests$/).first()).toBeVisible();
  await expect(page.getByText(/^Hold \d+ waves?$/).first()).toBeVisible();
  await expect(page.getByText(/^Reach The /).first()).toBeVisible();
});

test('inline rename persists across reload', async ({ page }) => {
  await onboard(page, { name: 'Tester' });
  await gotoTab(page, 'Ledger');
  await page.getByRole('button', { name: 'Rename' }).click();
  const input = page.getByLabel('Name');
  await expect(input).toHaveValue('Tester');
  await input.fill('Renamed One');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Renamed One', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
  await page.reload();
  await gotoTab(page, 'Ledger');
  await expect(page.getByText('Renamed One', { exact: true })).toBeVisible();
  await gotoTab(page, 'Haven');
  await expect(page.getByTestId('ring-header').getByText('Renamed One', { exact: true })).toBeVisible();
});
